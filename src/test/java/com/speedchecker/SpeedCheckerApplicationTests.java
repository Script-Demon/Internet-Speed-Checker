package com.speedchecker;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("h2")
class SpeedCheckerApplicationTests {

    @Autowired
    private MockMvc mvc;

    @BeforeEach
    void clean() throws Exception {
        mvc.perform(delete("/api/results")).andExpect(status().isNoContent());
    }

    @Test
    void pingResponds() throws Exception {
        mvc.perform(get("/api/speedtest/ping"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.serverTime").isNumber());
    }

    @Test
    void downloadReturnsRequestedBytes() throws Exception {
        mvc.perform(get("/api/speedtest/download").param("size", "5000"))
                .andExpect(status().isOk())
                .andExpect(header().longValue("Content-Length", 5000))
                .andExpect(result -> {
                    int length = result.getResponse().getContentAsByteArray().length;
                    if (length != 5000) throw new AssertionError("Expected 5000 bytes but got " + length);
                });
    }

    @Test
    void uploadCountsBytes() throws Exception {
        mvc.perform(post("/api/speedtest/upload")
                        .contentType(MediaType.APPLICATION_OCTET_STREAM)
                        .content(new byte[123_456]))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bytesReceived").value(123_456));
    }

    @Test
    void savesResultAndComputesStats() throws Exception {
        mvc.perform(post("/api/results")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"downloadMbps\":100.123,\"uploadMbps\":20,\"pingMs\":15,\"jitterMs\":2}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.downloadMbps").value(100.12));

        mvc.perform(post("/api/results")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"downloadMbps\":50,\"uploadMbps\":10,\"pingMs\":25,\"jitterMs\":4}"))
                .andExpect(status().isCreated());

        mvc.perform(get("/api/results"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));

        mvc.perform(get("/api/results/stats"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalTests").value(2))
                .andExpect(jsonPath("$.avgPingMs").value(20.0))
                .andExpect(jsonPath("$.bestDownloadMbps").value(100.12))
                .andExpect(jsonPath("$.bestPingMs").value(15.0));
    }

    @Test
    void rejectsInvalidResult() throws Exception {
        mvc.perform(post("/api/results")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"downloadMbps\":-5,\"uploadMbps\":10,\"pingMs\":25}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.downloadMbps").exists())
                .andExpect(jsonPath("$.fields.jitterMs").exists());
    }

    @Test
    void emptyStats() throws Exception {
        mvc.perform(get("/api/results/stats"))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"totalTests\":0}"));
    }

    @Test
    void servesFrontend() throws Exception {
        mvc.perform(get("/index.html"))
                .andExpect(status().isOk());
    }
}
