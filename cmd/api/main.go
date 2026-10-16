package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/TheLonger011/Nebula/internal/auth"
	"github.com/TheLonger011/Nebula/internal/config"
	"github.com/TheLonger011/Nebula/internal/database"
	"github.com/TheLonger011/Nebula/internal/httpapi"
	"github.com/TheLonger011/Nebula/internal/mail"
	"github.com/TheLonger011/Nebula/internal/repository"
	"github.com/TheLonger011/Nebula/internal/service"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal("Error loading config: ", err)
	}

	ctx := context.Background()
	db, err := database.ConnectDB(ctx, &cfg.DB)
	if err != nil {
		log.Fatal("Error connecting to database: ", err)
	}
	defer db.Close()

	rdb, err := database.ConnectRedis(ctx, cfg.Redis.Addr)
	if err != nil {
		log.Fatal("Error connecting to Redis: ", err)
	}
	defer rdb.Close()

	tokenManager := auth.NewTokenManager(cfg.JWT.Secret, 15*time.Minute)
	userRepository := repository.NewUserRepository(db)
	authService := service.NewAuthService(
		userRepository,
		repository.NewCodeRepository(rdb),
		repository.NewRefreshTokenRepository(db),
		mail.NewMailer(cfg.Verification.From, cfg.Verification.Password),
		tokenManager,
		30*24*time.Hour,
	)

	friendshipService := service.NewFriendshipService(repository.NewFriendshipRepository(db), userRepository)

	port := cfg.Server.Port
	if port == "" {
		port = "8080"
	}
	server := &http.Server{
		Addr:              ":" + port,
		Handler:           httpapi.New(authService, friendshipService, tokenManager, db).Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("Nebula API started on :%s", port)
	log.Fatal(server.ListenAndServe())
}
