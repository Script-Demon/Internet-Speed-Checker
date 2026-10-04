package com.speedchecker.dto;

public record StatsResponse(
        long totalTests,
        double avgDownloadMbps,
        double avgUploadMbps,
        double avgPingMs,
        double bestDownloadMbps,
        double bestUploadMbps,
        double bestPingMs
) {
    public static StatsResponse empty() {
        return new StatsResponse(0, 0, 0, 0, 0, 0, 0);
    }
}
