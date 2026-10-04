(() => {
    'use strict';

    // ---------------- Configuration ----------------
    const API = '/api';
    const CONFIG = {
        pingSamples: 12,              // first sample is a warm-up and is discarded
        testDurationMs: 10000,        // per download / upload phase
        graceMs: 1500,                // ignore the TCP slow-start period at the beginning
        downloadStreams: 4,
        uploadStreams: 3,
        downloadRequestBytes: 25 * 1024 * 1024,
        uploadChunkBytes: 4 * 1024 * 1024,
        sampleIntervalMs: 200,
    };

    // ---------------- DOM ----------------
    const $ = (id) => document.getElementById(id);
    const els = {
        startBtn: $('start-btn'),
        clearBtn: $('clear-btn'),
        gauge: document.querySelector('.gauge'),
        gaugeTrack: $('gauge-track'),
        gaugeFill: $('gauge-fill'),
        gaugeTicks: $('gauge-ticks'),
        gaugeValue: $('gauge-value'),
        phase: $('phase'),
        progress: $('progress-bar'),
        message: $('message'),
        ping: $('ping-value'),
        jitter: $('jitter-value'),
        download: $('download-value'),
        upload: $('upload-value'),
        historyBody: $('history-body'),
        cards: {
            ping: $('m-ping'),
            jitter: $('m-jitter'),
            download: $('m-download'),
            upload: $('m-upload'),
        },
    };

    // ---------------- Gauge ----------------
    const GAUGE = { cx: 100, cy: 100, r: 80, start: 135, sweep: 270 };
    const SCALE = [0, 1, 5, 10, 20, 50, 100, 250, 500, 1000];

    const polar = (angleDeg, r = GAUGE.r) => {
        const a = (angleDeg * Math.PI) / 180;
        return { x: GAUGE.cx + r * Math.cos(a), y: GAUGE.cy + r * Math.sin(a) };
    };

    const arcPath = (fraction) => {
        const f = Math.max(0, Math.min(1, fraction));
        if (f === 0) return '';
        const from = polar(GAUGE.start);
        const to = polar(GAUGE.start + GAUGE.sweep * f);
        const largeArc = GAUGE.sweep * f > 180 ? 1 : 0;
        return `M ${from.x} ${from.y} A ${GAUGE.r} ${GAUGE.r} 0 ${largeArc} 1 ${to.x} ${to.y}`;
    };

    // Piecewise-linear scale so both slow and fast connections are readable.
    const valueToFraction = (mbps) => {
        if (mbps <= 0) return 0;
        for (let i = 0; i < SCALE.length - 1; i++) {
            if (mbps <= SCALE[i + 1]) {
                const segment = (mbps - SCALE[i]) / (SCALE[i + 1] - SCALE[i]);
                return (i + segment) / (SCALE.length - 1);
            }
        }
        return 1;
    };

    const initGauge = () => {
        els.gaugeTrack.setAttribute('d', arcPath(1));
        const ns = 'http://www.w3.org/2000/svg';
        SCALE.forEach((v, i) => {
            const p = polar(GAUGE.start + (GAUGE.sweep * i) / (SCALE.length - 1), GAUGE.r - 20);
            const t = document.createElementNS(ns, 'text');
            t.setAttribute('x', p.x.toFixed(1));
            t.setAttribute('y', p.y.toFixed(1));
            t.textContent = v >= 1000 ? `${v / 1000}G` : String(v);
            els.gaugeTicks.appendChild(t);
        });
    };

    const setGauge = (mbps) => {
        els.gaugeFill.setAttribute('d', arcPath(valueToFraction(mbps)));
        els.gaugeValue.textContent = formatSpeed(mbps);
    };

    // ---------------- Helpers ----------------
    const formatSpeed = (v) => {
        if (v == null || Number.isNaN(v)) return '–';
        if (v < 10) return v.toFixed(2);
        if (v < 100) return v.toFixed(1);
        return v.toFixed(0);
    };
    const formatMs = (v) => (v == null ? '–' : v < 10 ? v.toFixed(1) : v.toFixed(0));
    const bust = () => `t=${Date.now()}${Math.random().toString(36).slice(2)}`;
    const mbps = (bytes, ms) => (ms > 0 ? (bytes * 8) / (ms / 1000) / 1e6 : 0);

    const setPhase = (text) => { els.phase.textContent = text; };
    const setProgress = (fraction) => { els.progress.style.width = `${Math.min(100, fraction * 100)}%`; };
    const setMessage = (text, isError = false) => {
        els.message.textContent = text;
        els.message.classList.toggle('error', isError);
    };
    const highlight = (key) => {
        Object.entries(els.cards).forEach(([k, el]) => el.classList.toggle('active', k === key));
    };

    // ---------------- Ping & jitter ----------------
    async function measurePing() {
        const samples = [];
        for (let i = 0; i < CONFIG.pingSamples; i++) {
            const t0 = performance.now();
            const res = await fetch(`${API}/speedtest/ping?${bust()}`, { cache: 'no-store' });
            await res.arrayBuffer();
            const rtt = performance.now() - t0;
            if (!res.ok) throw new Error(`Ping failed (HTTP ${res.status})`);
            if (i > 0) {
                samples.push(rtt);
                els.ping.textContent = formatMs(rtt);
            }
            setProgress(((i + 1) / CONFIG.pingSamples) * 0.1);
        }

        const sorted = [...samples].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const ping = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

        let diffSum = 0;
        for (let i = 1; i < samples.length; i++) diffSum += Math.abs(samples[i] - samples[i - 1]);
        const jitter = samples.length > 1 ? diffSum / (samples.length - 1) : 0;

        return { ping, jitter };
    }

    // ---------------- Timed throughput test (shared by download & upload) ----------------
    /**
     * Runs `streams` parallel workers for CONFIG.testDurationMs and returns the throughput in Mbps,
     * ignoring the first CONFIG.graceMs. Workers add transferred bytes to `counter.bytes`.
     */
    function runTimedTest({ streams, worker, abortAll, onSample }) {
        return new Promise((resolve, reject) => {
            const counter = { bytes: 0, running: true };
            const start = performance.now();
            let graceBytes = null;
            let graceAt = null;
            let finished = false;

            const finish = (error) => {
                if (finished) return;
                finished = true;
                counter.running = false;
                clearInterval(timer);
                abortAll();
                if (error) {
                    reject(error);
                    return;
                }
                const elapsed = performance.now() - start;
                resolve(graceAt == null
                    ? mbps(counter.bytes, elapsed)
                    : mbps(counter.bytes - graceBytes, elapsed - graceAt));
            };

            const timer = setInterval(() => {
                const elapsed = performance.now() - start;
                if (graceAt == null && elapsed >= CONFIG.graceMs) {
                    graceAt = elapsed;
                    graceBytes = counter.bytes;
                }
                const speed = graceAt == null || elapsed - graceAt < 200
                    ? mbps(counter.bytes, elapsed)
                    : mbps(counter.bytes - graceBytes, elapsed - graceAt);
                onSample(speed, elapsed / CONFIG.testDurationMs);
                if (elapsed >= CONFIG.testDurationMs) finish();
            }, CONFIG.sampleIntervalMs);

            for (let i = 0; i < streams; i++) {
                worker(counter).catch((err) => { if (counter.running) finish(err); });
            }
        });
    }

    // ---------------- Download ----------------
    function measureDownload(onSample) {
        const controllers = new Set();

        const worker = async (counter) => {
            while (counter.running) {
                const controller = new AbortController();
                controllers.add(controller);
                try {
                    const res = await fetch(
                        `${API}/speedtest/download?size=${CONFIG.downloadRequestBytes}&${bust()}`,
                        { cache: 'no-store', signal: controller.signal });
                    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
                    const reader = res.body.getReader();
                    while (counter.running) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        counter.bytes += value.byteLength;
                    }
                } catch (err) {
                    if (!counter.running && err.name === 'AbortError') return;
                    throw err;
                } finally {
                    controllers.delete(controller);
                }
            }
        };

        return runTimedTest({
            streams: CONFIG.downloadStreams,
            worker,
            abortAll: () => controllers.forEach((c) => c.abort()),
            onSample,
        });
    }

    // ---------------- Upload ----------------
    let uploadPayload = null;
    const getUploadPayload = () => {
        if (!uploadPayload) {
            // Random data so nothing along the way can compress it.
            const data = new Uint8Array(CONFIG.uploadChunkBytes);
            for (let i = 0; i < data.length; i += 65536) {
                crypto.getRandomValues(data.subarray(i, i + 65536));
            }
            uploadPayload = new Blob([data], { type: 'application/octet-stream' });
        }
        return uploadPayload;
    };

    function measureUpload(onSample) {
        const requests = new Set();
        const payload = getUploadPayload();

        const sendOnce = (counter) => new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            let lastLoaded = 0;
            requests.add(xhr);
            xhr.open('POST', `${API}/speedtest/upload?${bust()}`, true);
            xhr.setRequestHeader('Content-Type', 'application/octet-stream');
            xhr.upload.onprogress = (e) => {
                counter.bytes += e.loaded - lastLoaded;
                lastLoaded = e.loaded;
            };
            xhr.onload = () => {
                requests.delete(xhr);
                if (xhr.status >= 200 && xhr.status < 300) resolve();
                else reject(new Error(`Upload failed (HTTP ${xhr.status})`));
            };
            xhr.onerror = () => { requests.delete(xhr); reject(new Error('Upload failed (network error)')); };
            xhr.onabort = () => { requests.delete(xhr); resolve(); };
            xhr.send(payload);
        });

        const worker = async (counter) => {
            while (counter.running) {
                await sendOnce(counter);
            }
        };

        return runTimedTest({
            streams: CONFIG.uploadStreams,
            worker,
            abortAll: () => requests.forEach((x) => x.abort()),
            onSample,
        });
    }

    // ---------------- Results API ----------------
    async function saveResult(result) {
        const res = await fetch(`${API}/results`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result),
        });
        if (!res.ok) throw new Error(`Could not save result (HTTP ${res.status})`);
        return res.json();
    }

    async function loadHistory() {
        try {
            const res = await fetch(`${API}/results?limit=20`, { cache: 'no-store' });
            if (!res.ok) throw new Error();
            renderHistory(await res.json());
        } catch {
            renderHistory(null);
        }
    }

    async function loadStats() {
        try {
            const res = await fetch(`${API}/results/stats`, { cache: 'no-store' });
            if (!res.ok) throw new Error();
            const s = await res.json();
            const has = s.totalTests > 0;
            $('s-count').textContent = s.totalTests;
            $('s-down').textContent = has ? `${formatSpeed(s.avgDownloadMbps)} Mbps` : '–';
            $('s-up').textContent = has ? `${formatSpeed(s.avgUploadMbps)} Mbps` : '–';
            $('s-ping').textContent = has ? `${formatMs(s.avgPingMs)} ms` : '–';
            $('s-best-down').textContent = has ? `${formatSpeed(s.bestDownloadMbps)} Mbps` : '–';
            $('s-best-ping').textContent = has ? `${formatMs(s.bestPingMs)} ms` : '–';
        } catch {
            // stats are optional; leave the placeholders
        }
    }

    function renderHistory(rows) {
        const body = els.historyBody;
        body.replaceChildren();

        if (!rows || rows.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 6;
            td.className = 'empty';
            td.textContent = rows ? 'No tests yet' : 'Could not load history (is the database running?)';
            tr.appendChild(td);
            body.appendChild(tr);
            return;
        }

        rows.forEach((r) => {
            const tr = document.createElement('tr');
            const cells = [
                [new Date(r.testedAt).toLocaleString(), ''],
                [`${formatSpeed(r.downloadMbps)} Mbps`, 'num'],
                [`${formatSpeed(r.uploadMbps)} Mbps`, 'num'],
                [`${formatMs(r.pingMs)} ms`, 'num'],
                [`${formatMs(r.jitterMs)} ms`, 'num'],
            ];
            cells.forEach(([text, cls]) => {
                const td = document.createElement('td');
                td.textContent = text;
                if (cls) td.className = cls;
                tr.appendChild(td);
            });

            const delTd = document.createElement('td');
            delTd.className = 'num';
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'link-btn row-del';
            del.textContent = '✕';
            del.title = 'Delete this result';
            del.addEventListener('click', async () => {
                await fetch(`${API}/results/${r.id}`, { method: 'DELETE' });
                refresh();
            });
            delTd.appendChild(del);
            tr.appendChild(delTd);

            body.appendChild(tr);
        });
    }

    const refresh = () => Promise.all([loadHistory(), loadStats()]);

    // ---------------- Orchestration ----------------
    async function runFullTest() {
        els.startBtn.disabled = true;
        els.startBtn.textContent = 'Testing…';
        setMessage('');
        [els.ping, els.jitter, els.download, els.upload].forEach((el) => { el.textContent = '–'; });
        setGauge(0);
        setProgress(0);

        try {
            setPhase('Ping');
            highlight('ping');
            const { ping, jitter } = await measurePing();
            els.ping.textContent = formatMs(ping);
            els.jitter.textContent = formatMs(jitter);

            setPhase('Download');
            highlight('download');
            els.gauge.classList.remove('upload');
            const download = await measureDownload((speed, frac) => {
                setGauge(speed);
                els.download.textContent = formatSpeed(speed);
                setProgress(0.1 + Math.min(frac, 1) * 0.45);
            });
            els.download.textContent = formatSpeed(download);
            setGauge(0);

            setPhase('Upload');
            highlight('upload');
            els.gauge.classList.add('upload');
            const upload = await measureUpload((speed, frac) => {
                setGauge(speed);
                els.upload.textContent = formatSpeed(speed);
                setProgress(0.55 + Math.min(frac, 1) * 0.45);
            });
            els.upload.textContent = formatSpeed(upload);
            setGauge(upload);
            setProgress(1);

            setPhase('Complete');
            highlight(null);

            try {
                await saveResult({ downloadMbps: download, uploadMbps: upload, pingMs: ping, jitterMs: jitter });
                setMessage('Result saved.');
            } catch (err) {
                setMessage(err.message, true);
            }
            await refresh();
        } catch (err) {
            console.error(err);
            setPhase('Error');
            highlight(null);
            setMessage(err.message || 'The test failed. Is the server running?', true);
        } finally {
            els.gauge.classList.remove('upload');
            els.startBtn.disabled = false;
            els.startBtn.textContent = 'Test Again';
        }
    }

    els.startBtn.addEventListener('click', runFullTest);
    els.clearBtn.addEventListener('click', async () => {
        if (!window.confirm('Delete all saved results?')) return;
        await fetch(`${API}/results`, { method: 'DELETE' });
        refresh();
    });

    initGauge();
    setGauge(0);
    refresh();
})();
