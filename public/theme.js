const savedTheme = localStorage.getItem('study-groups-theme');
if (savedTheme === 'dark' || savedTheme === 'light') {
    document.documentElement.dataset.theme = savedTheme;
} else {
    document.documentElement.dataset.theme = 'dark';
}

document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.querySelector('.theme-toggle');
    if (!themeToggle) return;

    function updateThemeToggle() {
        const isDark = document.documentElement.dataset.theme === 'dark';
        const label = `Switch to ${isDark ? 'light' : 'dark'} mode`;
        themeToggle.setAttribute('aria-label', label);
        themeToggle.title = label;
        themeToggle.setAttribute('aria-pressed', String(isDark));
    }

    themeToggle.addEventListener('click', () => {
        const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = nextTheme;
        localStorage.setItem('study-groups-theme', nextTheme);
        updateThemeToggle();
    });

    updateThemeToggle();
});
