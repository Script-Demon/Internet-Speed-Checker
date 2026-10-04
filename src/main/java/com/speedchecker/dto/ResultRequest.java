package com.speedchecker.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

/** Payload the browser sends after finishing a test. */
public record ResultRequest(
        @NotNull @DecimalMin("0.0") @DecimalMax("100000.0") Double downloadMbps,
        @NotNull @DecimalMin("0.0") @DecimalMax("100000.0") Double uploadMbps,
        @NotNull @DecimalMin("0.0") @DecimalMax("60000.0") Double pingMs,
        @NotNull @DecimalMin("0.0") @DecimalMax("60000.0") Double jitterMs
) {
}
