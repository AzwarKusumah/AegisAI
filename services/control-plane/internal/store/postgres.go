package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/AzwarKusumah/AegisAI/services/control-plane/internal/events"
	_ "github.com/jackc/pgx/v5/stdlib"
)

type Store struct { db *sql.DB }

func Open(ctx context.Context, dsn string) (*Store, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil { return nil, err }
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30*time.Minute)
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
	"CREATE INDEX IF NOT EXISTS idx_security_events_provider ON security_events (provider);"

func (s *Store) Insert(ctx context.Context, event events.SecurityEvent) error {
	payload, err := json.Marshal(event)
	if err != nil { return err }
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
	rows, err := s.db.QueryContext(ctx,
		"SELECT payload FROM security_events WHERE ($1 = '' OR actor_username ILIKE '%' || $1 || '%' OR file_name ILIKE '%' || $1 || '%' OR provider ILIKE '%' || $1 || '%') ORDER BY occurred_at DESC LIMIT $2",
		query, limit)
	if err != nil { return nil, err }
	defer rows.Close()
	result := make([]events.SecurityEvent, 0)
	for rows.Next() {
		var payload []byte
		var event events.SecurityEvent
		if err := rows.Scan(&payload); err != nil { return nil, err }
		if err := json.Unmarshal(payload, &event); err != nil { return nil, err }
		result = append(result, event)
	}
	return result, rows.Err()
}
