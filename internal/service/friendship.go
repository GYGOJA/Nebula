package service

import (
	"context"
	"errors"
	"strings"

	"github.com/GYGOJA/Nebula/internal/models"
	"github.com/GYGOJA/Nebula/internal/repository"
	"github.com/google/uuid"
)

var (
	ErrSelfFriendRequest = errors.New("cannot add yourself")
	ErrUserNotFound      = errors.New("user not found")
)

type FriendshipService struct {
	friends *repository.FriendshipRepository
	users   *repository.UserRepository
}

func NewFriendshipService(friends *repository.FriendshipRepository, users *repository.UserRepository) *FriendshipService {
	return &FriendshipService{friends: friends, users: users}
}

func (s *FriendshipService) SendRequest(ctx context.Context, requesterID uuid.UUID, username string) (*models.Friendship, error) {
	username = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(username), "@"))
	if username == "" {
		return nil, ErrInvalidInput
	}
	user, err := s.users.GetByUsername(ctx, username)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	if user.ID == requesterID {
		return nil, ErrSelfFriendRequest
	}
	return s.friends.CreateRequest(ctx, requesterID, user.ID)
}

func (s *FriendshipService) Friends(ctx context.Context, userID uuid.UUID) ([]*models.User, error) {
	return s.friends.ListFriends(ctx, userID)
}

func (s *FriendshipService) Requests(ctx context.Context, userID uuid.UUID) (incoming, outgoing []repository.FriendshipEntry, err error) {
	return s.friends.ListRequests(ctx, userID)
}
func (s *FriendshipService) Accept(ctx context.Context, requestID, userID uuid.UUID) error {
	return s.friends.Accept(ctx, requestID, userID)
}
func (s *FriendshipService) Decline(ctx context.Context, requestID, userID uuid.UUID) error {
	return s.friends.Decline(ctx, requestID, userID)
}
func (s *FriendshipService) Remove(ctx context.Context, userID, friendID uuid.UUID) error {
	return s.friends.Remove(ctx, userID, friendID)
}

func (s *FriendshipService) Cancel(ctx context.Context, requestID, userID uuid.UUID) error {
	return s.friends.Cancel(ctx, requestID, userID)
}
