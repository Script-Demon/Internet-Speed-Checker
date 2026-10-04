package com.speedchecker.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Endpoints the browser uses to measure the connection between itself and this server.
 */
@RestController
@RequestMapping("/api/speedtest")
public class SpeedTestController {

    private static final int CHUNK_SIZE = 1024 * 1024; // 1 MB
    private static final long MAX_DOWNLOAD_BYTES = 200L * 1024 * 1024; // 200 MB per request

    /** Random (incompressible) bytes, generated once and streamed repeatedly. */
    private static final byte[] RANDOM_CHUNK = new byte[CHUNK_SIZE];

    static {
        ThreadLocalRandom.current().nextBytes(RANDOM_CHUNK);
    }

    /** Tiny response used to measure round-trip latency (ping) and jitter. */
    @GetMapping("/ping")
    public ResponseEntity<Map<String, Long>> ping() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(Map.of("serverTime", System.currentTimeMillis()));
    }

    /** Streams {@code size} bytes of random data. The client usually aborts once its time budget is used up. */
    @GetMapping("/download")
    public void download(@RequestParam(defaultValue = "26214400") long size, HttpServletResponse response) {
        long total = Math.max(1, Math.min(size, MAX_DOWNLOAD_BYTES));

        response.setContentType(MediaType.APPLICATION_OCTET_STREAM_VALUE);
        response.setContentLengthLong(total);
        response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

        try (OutputStream out = response.getOutputStream()) {
            long remaining = total;
            while (remaining > 0) {
                int len = (int) Math.min(CHUNK_SIZE, remaining);
                out.write(RANDOM_CHUNK, 0, len);
                remaining -= len;
            }
            out.flush();
        } catch (IOException clientAborted) {
            // Expected: the browser cancels the request when the test window ends.
        }
    }

    /** Reads and discards the request body, returning how many bytes arrived. */
    @PostMapping("/upload")
    public ResponseEntity<Map<String, Long>> upload(HttpServletRequest request) throws IOException {
        long received = 0;
        byte[] buffer = new byte[64 * 1024];
        try (InputStream in = request.getInputStream()) {
            int read;
            while ((read = in.read(buffer)) != -1) {
                received += read;
            }
        }
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(Map.of("bytesReceived", received));
    }
}
