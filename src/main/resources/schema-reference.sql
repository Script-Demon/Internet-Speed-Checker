-- Reference only: Hibernate creates this table automatically (spring.jpa.hibernate.ddl-auto=update).
-- Useful if you want to create it by hand or see what is stored.

CREATE DATABASE speedchecker;

-- \c speedchecker

CREATE TABLE IF NOT EXISTS speed_test_results (
    id             BIGSERIAL PRIMARY KEY,
    download_mbps  DOUBLE PRECISION NOT NULL,
    upload_mbps    DOUBLE PRECISION NOT NULL,
    ping_ms        DOUBLE PRECISION NOT NULL,
    jitter_ms      DOUBLE PRECISION NOT NULL,
    ip_address     VARCHAR(64),
    user_agent     VARCHAR(512),
    tested_at      TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_results_tested_at ON speed_test_results (tested_at);
