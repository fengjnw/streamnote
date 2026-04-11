/**
 * Date/time formatting helpers shared by non-module scripts.
 */
class DateTimeUtils {
    static pad2(value) {
        return String(value).padStart(2, '0');
    }

    static formatDate(date) {
        const year = date.getFullYear();
        const month = DateTimeUtils.pad2(date.getMonth() + 1);
        const day = DateTimeUtils.pad2(date.getDate());
        return `${year}-${month}-${day}`;
    }

    static formatTime(date) {
        const hours = DateTimeUtils.pad2(date.getHours());
        const minutes = DateTimeUtils.pad2(date.getMinutes());
        const seconds = DateTimeUtils.pad2(date.getSeconds());
        return `${hours}:${minutes}:${seconds}`;
    }

    static formatDateTime(date) {
        return `${DateTimeUtils.formatDate(date)} ${DateTimeUtils.formatTime(date)}`;
    }

    static formatDateFromEpochMs(epochMs) {
        return DateTimeUtils.formatDate(new Date(epochMs));
    }

    static formatTimeFromEpochMs(epochMs) {
        return DateTimeUtils.formatTime(new Date(epochMs));
    }

    static getNowTimeString() {
        return new Date().toLocaleTimeString('zh-CN', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
}

window.DateTimeUtils = DateTimeUtils;
