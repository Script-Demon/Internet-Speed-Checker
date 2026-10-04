package com.speedchecker.repository;

import com.speedchecker.model.SpeedTestResult;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface SpeedTestResultRepository extends JpaRepository<SpeedTestResult, Long> {

    List<SpeedTestResult> findAllByOrderByTestedAtDesc(Pageable pageable);

    @Query("""
            SELECT COUNT(r), AVG(r.downloadMbps), AVG(r.uploadMbps), AVG(r.pingMs),
                   MAX(r.downloadMbps), MAX(r.uploadMbps), MIN(r.pingMs)
            FROM SpeedTestResult r
            """)
    List<Object[]> aggregateStats();
}
