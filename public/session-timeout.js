(() => {
    const warning = document.getElementById('session-timeout-warning');
    const message = document.getElementById('session-timeout-message');
    const staySignedInButton = document.getElementById('stay-signed-in');
    if (!warning || !message || !staySignedInButton) return;

    const timeoutMs = 5 * 60 * 1000;
    const warningMs = 4 * 60 * 1000;
    const activityPingIntervalMs = 30 * 1000;
    const warningText = 'Your session will expire in 1 minute due to inactivity.';
    let lastActivityAt = null;
    let lastActivityPingAt = 0;
    let warningTimer;
    let expiryTimer;
    let expirationStarted = false;

    function expireSession() {
        if (expirationStarted) return;
        expirationStarted = true;
        clearTimeout(warningTimer);
        clearTimeout(expiryTimer);
        fetch('/api/auth/logout', { method: 'POST', keepalive: true })
            .catch(() => {})
            .finally(() => window.location.replace('/login?error=session_timeout'));
    }

    function scheduleTimeouts() {
        clearTimeout(warningTimer);
        clearTimeout(expiryTimer);
        warningTimer = setTimeout(() => {
            if (Date.now() - lastActivityAt >= warningMs && !expirationStarted) {
                warning.hidden = false;
            }
        }, Math.max(0, lastActivityAt + warningMs - Date.now()));
        expiryTimer = setTimeout(() => {
            if (Date.now() - lastActivityAt >= timeoutMs) {
                expireSession();
            } else {
                scheduleTimeouts();
            }
        }, Math.max(0, lastActivityAt + timeoutMs - Date.now()));
    }

    function recordActivity(forcePing = false) {
        if (lastActivityAt === null || expirationStarted) return;
        const now = Date.now();
        if (now - lastActivityAt >= timeoutMs) {
            expireSession();
            return;
        }

        lastActivityAt = now;
        warning.hidden = true;
        message.innerText = warningText;
        scheduleTimeouts();

        if (forcePing || now - lastActivityPingAt >= activityPingIntervalMs) {
            lastActivityPingAt = now;
            fetch('/api/auth/activity', { method: 'POST' }).then((response) => {
                if (response.status === 401) {
                    expireSession();
                } else if (!response.ok) {
                    throw new Error('Unable to confirm your session is active.');
                }
            }).catch(() => {
                warning.hidden = false;
                message.innerText = 'Unable to confirm your session is active. Check your connection.';
            });
        }
    }

    function checkForExpiredSession() {
        if (lastActivityAt !== null && Date.now() - lastActivityAt >= timeoutMs) {
            expireSession();
        }
    }

    document.addEventListener('pointerdown', () => recordActivity(), { passive: true });
    document.addEventListener('keydown', () => recordActivity());
    document.addEventListener('touchstart', () => recordActivity(), { passive: true });
    document.addEventListener('scroll', () => recordActivity(), { passive: true });
    document.addEventListener('visibilitychange', checkForExpiredSession);
    window.addEventListener('focus', checkForExpiredSession);
    staySignedInButton.addEventListener('click', () => recordActivity(true));

    window.startSessionTimeout = () => {
        if (lastActivityAt !== null) return;
        lastActivityAt = Date.now();
        lastActivityPingAt = lastActivityAt;
        scheduleTimeouts();
    };
})();
