package com.speedchecker.service;

import com.speedchecker.dto.ResultRequest;
import com.speedchecker.dto.StatsResponse;
import com.speedchecker.model.SpeedTestResult;
import com.speedchecker.repository.SpeedTestResultRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class ResultService {

    private static final int MAX_HISTORY = 100;

    private final SpeedTestResultRepository repository;

    public ResultService(SpeedTestResultRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public SpeedTestResult save(ResultRequest request, String ipAddress, String userAgent) {
        SpeedTestResult result = new SpeedTestResult(
                round(request.downloadMbps()),
                round(request.uploadMbps()),
                round(request.pingMs()),
                round(request.jitterMs()),
                ipAddress,
                truncate(userAgent, 512));
        return repository.save(result);
    }

    @Transactional(readOnly = true)
    public List<SpeedTestResult> recent(int limit) {
        int size = Math.max(1, Math.min(limit, MAX_HISTORY));
        return repository.findAllByOrderByTestedAtDesc(PageRequest.of(0, size));
    }

    @Transactional(readOnly = true)
    public StatsResponse stats() {
        List<Object[]> rows = repository.aggregateStats();
        if (rows.isEmpty() || rows.get(0)[0] == null || ((Number) rows.get(0)[0]).longValue() == 0) {
            return StatsResponse.empty();
        }
        Object[] row = rows.get(0);
        return new StatsResponse(
                ((Number) row[0]).longValue(),
                round(num(row[1])),
                round(num(row[2])),
                round(num(row[3])),
                num(row[4]),
                num(row[5]),
                num(row[6]));
    }

    @Transactional
    public boolean delete(long id) {
        if (!repository.existsById(id)) {
            return false;
        }
        repository.deleteById(id);
        return true;
    }

    @Transactional
    public void deleteAll() {
        repository.deleteAllInBatch();
    }

    private static double num(Object value) {
        return value == null ? 0 : ((Number) value).doubleValue();
    }

    private static double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }
}
