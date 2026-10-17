package database

import (
	"context"
	"fmt"

	"github.com/GYGOJA/Nebula/internal/config"
	"github.com/jackc/pgx/v5/pgxpool"
)

func ConnectDB(ctx context.Context, db *config.DBConfig) (*pgxpool.Pool, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=require",
		db.Host, db.Port, db.Username, db.Password, db.Database,
	)
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("could not connect to database: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("could not ping database: %w", err)
	}

	return pool, nil
}
