package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/AzwarKusumah/AegisAI/services/control-plane/internal/events"
	_ "github.com/jackc/pgx/v5/stdlib"
)

var ErrInvalidPairingCode = errors.New("pairing code is invalid, expired, or already used")
type Store struct { db *sql.DB }

func Open(ctx context.Context, dsn string) (*Store, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil { return nil, err }
	db.SetMaxOpenConns(20); db.SetMaxIdleConns(5); db.SetConnMaxLifetime(30*time.Minute)
	if err := db.PingContext(ctx); err != nil { db.Close(); return nil, err }
	if _, err := db.ExecContext(ctx, schema); err != nil { db.Close(); return nil, fmt.Errorf("initialize schema: %w", err) }
	return &Store{db: db}, nil
}
func (s *Store) Close() error { return s.db.Close() }

const schema = "CREATE TABLE IF NOT EXISTS security_events (" +
	"event_id TEXT PRIMARY KEY, occurred_at TIMESTAMPTZ NOT NULL, actor_username TEXT NOT NULL, " +
	"device_id TEXT NOT NULL, provider TEXT NOT NULL, event_type TEXT NOT NULL, file_name TEXT NOT NULL, " +
	"file_size_bytes BIGINT NOT NULL, outcome TEXT NOT NULL, risk_score SMALLINT NOT NULL, " +
	"payload JSONB NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT NOW());" +
	"CREATE INDEX IF NOT EXISTS idx_security_events_occurred_at ON security_events (occurred_at DESC);" +
	"CREATE INDEX IF NOT EXISTS idx_security_events_actor ON security_events (actor_username);" +
	"CREATE INDEX IF NOT EXISTS idx_security_events_provider ON security_events (provider);" +
	"CREATE TABLE IF NOT EXISTS agent_pairing_codes (code_hash TEXT PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());" +
	"CREATE INDEX IF NOT EXISTS idx_agent_pairing_codes_expiry ON agent_pairing_codes (expires_at);" +
	"CREATE TABLE IF NOT EXISTS managed_devices (device_id TEXT PRIMARY KEY, hostname TEXT NOT NULL, os TEXT NOT NULL, username TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', token_hash TEXT NOT NULL UNIQUE, enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_seen_at TIMESTAMPTZ);" +
	"CREATE INDEX IF NOT EXISTS idx_managed_devices_status ON managed_devices (status);" +
	"CREATE INDEX IF NOT EXISTS idx_managed_devices_last_seen ON managed_devices (last_seen_at DESC);"

func (s *Store) Insert(ctx context.Context, event events.SecurityEvent) error {
	payload, err := json.Marshal(event); if err != nil { return err }
	_, err = s.db.ExecContext(ctx,
		"INSERT INTO security_events (event_id,occurred_at,actor_username,device_id,provider,event_type,file_name,file_size_bytes,outcome,risk_score,payload) "+
			"VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) ON CONFLICT (event_id) DO NOTHING",
		event.EventID, event.OccurredAt, event.Actor.Username, event.Device.DeviceID,
		event.Provider, event.EventType, event.File.Name, event.File.SizeBytes,
		event.Outcome, event.Inspection.RiskScore, string(payload))
	return err
}
func (s *Store) List(ctx context.Context, query string, limit int) ([]events.SecurityEvent, error) {
	query = strings.TrimSpace(query)
	rows, err := s.db.QueryContext(ctx, "SELECT payload FROM security_events WHERE ($1 = '' OR actor_username ILIKE '%' || $1 || '%' OR file_name ILIKE '%' || $1 || '%' OR provider ILIKE '%' || $1 || '%') ORDER BY occurred_at DESC LIMIT $2", query, limit)
	if err != nil { return nil, err }; defer rows.Close()
	result := make([]events.SecurityEvent, 0)
	for rows.Next() {
		var payload []byte; var event events.SecurityEvent
		if err := rows.Scan(&payload); err != nil { return nil, err }
		if err := json.Unmarshal(payload, &event); err != nil { return nil, err }
		result = append(result, event)
	}
	return result, rows.Err()
}
func (s *Store) CreatePairingCode(ctx context.Context, codeHash string, expiresAt time.Time) error {
	_, err := s.db.ExecContext(ctx, "INSERT INTO agent_pairing_codes (code_hash, expires_at) VALUES ($1, $2)", codeHash, expiresAt)
	return err
}
func (s *Store) EnrollDevice(ctx context.Context, codeHash string, device events.DeviceRecord, tokenHash string) error {
	tx, err := s.db.BeginTx(ctx, nil); if err != nil { return err }; defer tx.Rollback()
	result, err := tx.ExecContext(ctx, "UPDATE agent_pairing_codes SET used_at = NOW() WHERE code_hash = $1 AND used_at IS NULL AND expires_at > NOW()", codeHash)
	if err != nil { return err }; affected, err := result.RowsAffected(); if err != nil { return err }
	if affected != 1 { return ErrInvalidPairingCode }
	_, err = tx.ExecContext(ctx,
		"INSERT INTO managed_devices (device_id, hostname, os, username, status, token_hash, enrolled_at, last_seen_at) "+
		"VALUES ($1,$2,$3,$4,'active',$5,NOW(),NULL) "+
		"ON CONFLICT (device_id) DO UPDATE SET hostname=EXCLUDED.hostname, os=EXCLUDED.os, username=EXCLUDED.username, status='active', token_hash=EXCLUDED.token_hash, enrolled_at=NOW(), last_seen_at=NULL",
		device.DeviceID, device.Hostname, device.OS, device.Username, tokenHash)
	if err != nil { return err }
	return tx.Commit()
}
func (s *Store) DeviceForToken(ctx context.Context, tokenHash string) (string, string, error) {
	var id, status string
	err := s.db.QueryRowContext(ctx, "SELECT device_id, status FROM managed_devices WHERE token_hash = $1", tokenHash).Scan(&id, &status)
	if errors.Is(err, sql.ErrNoRows) { return "", "", nil }
	return id, status, err
}
func (s *Store) ListDevices(ctx context.Context) ([]events.DeviceRecord, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT device_id, hostname, os, username, status, enrolled_at, last_seen_at FROM managed_devices ORDER BY enrolled_at DESC")
	if err != nil { return nil, err }; defer rows.Close()
	result := make([]events.DeviceRecord, 0)
	for rows.Next() {
		var item events.DeviceRecord
		if err := rows.Scan(&item.DeviceID, &item.Hostname, &item.OS, &item.Username, &item.Status, &item.EnrolledAt, &item.LastSeenAt); err != nil { return nil, err }
		result = append(result, item)
	}
	return result, rows.Err()
}
func (s *Store) RevokeDevice(ctx context.Context, deviceID string) error {
	result, err := s.db.ExecContext(ctx, "UPDATE managed_devices SET status='revoked', token_hash='revoked:' || device_id WHERE device_id=$1", deviceID)
	if err != nil { return err }; affected, err := result.RowsAffected(); if err != nil { return err }
	if affected == 0 { return sql.ErrNoRows }; return nil
}
func (s *Store) TouchDevice(ctx context.Context, deviceID string) error {
	_, err := s.db.ExecContext(ctx, "UPDATE managed_devices SET last_seen_at=NOW() WHERE device_id=$1 AND status='active'", deviceID)
	return err
}
