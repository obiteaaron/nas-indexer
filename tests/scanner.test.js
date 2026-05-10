const { formatSize } = require('../src/scanner');

describe('Scanner', () => {
  describe('formatSize', () => {
    test('should format bytes correctly', () => {
      expect(formatSize(0)).toBe('0 B');
      expect(formatSize(1023)).toBe('1023.00 B');
    });

    test('should format kilobytes correctly', () => {
      expect(formatSize(1024)).toBe('1.00 KB');
      expect(formatSize(1536)).toBe('1.50 KB');
    });

    test('should format megabytes correctly', () => {
      expect(formatSize(1048576)).toBe('1.00 MB');
      expect(formatSize(1572864)).toBe('1.50 MB');
    });

    test('should format gigabytes correctly', () => {
      expect(formatSize(1073741824)).toBe('1.00 GB');
      expect(formatSize(1610612736)).toBe('1.50 GB');
    });

    test('should format terabytes correctly', () => {
      expect(formatSize(1099511627776)).toBe('1.00 TB');
    });
  });
});
