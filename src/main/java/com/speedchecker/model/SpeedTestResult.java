package com.speedchecker.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "speed_test_results", indexes = @Index(name = "idx_results_tested_at", columnList = "tested_at"))
public class SpeedTestResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "download_mbps", nullable = false)
    private double downloadMbps;

    @Column(name = "upload_mbps", nullable = false)
    private double uploadMbps;

    @Column(name = "ping_ms", nullable = false)
    private double pingMs;

    @Column(name = "jitter_ms", nullable = false)
    private double jitterMs;

    @Column(name = "ip_address", length = 64)
    private String ipAddress;

    @Column(name = "user_agent", length = 512)
    private String userAgent;

    @Column(name = "tested_at", nullable = false, updatable = false)
    private Instant testedAt;

    protected SpeedTestResult() {
        // required by JPA
    }

    public SpeedTestResult(double downloadMbps, double uploadMbps, double pingMs, double jitterMs,
                           String ipAddress, String userAgent) {
        this.downloadMbps = downloadMbps;
        this.uploadMbps = uploadMbps;
        this.pingMs = pingMs;
        this.jitterMs = jitterMs;
        this.ipAddress = ipAddress;
        this.userAgent = userAgent;
    }

    @PrePersist
    void onCreate() {
        if (testedAt == null) {
            testedAt = Instant.now();
        }
    }

    public Long getId() { return id; }
    public double getDownloadMbps() { return downloadMbps; }
    public double getUploadMbps() { return uploadMbps; }
    public double getPingMs() { return pingMs; }
    public double getJitterMs() { return jitterMs; }
    public String getIpAddress() { return ipAddress; }
    public String getUserAgent() { return userAgent; }
    public Instant getTestedAt() { return testedAt; }
}
