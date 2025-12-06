// Helper: format duration in seconds into H:MM:SS or MM:SS
export function formatDuration(seconds) {
  if (!seconds) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Helper: derive a friendly title from a filename (strip extension/leading numbers)
export function formatTitle(filename) {
  if (!filename) return '';
  // Normalize and ensure we only use the basename (in case an upstream value contains path segments)
  const basename = (filename || '').split('/').pop();
  filename = basename;
  // Remove extension
  let name = filename.replace(/\.[^/.]+$/, '');
  // Replace underscores with spaces
  name = name.replace(/[_]/g, ' ');
  // Remove leading numbers and separators (e.g., "01. ", "1 - ", "01 ")
  name = name.replace(/^(\d+)[\s\-\.]+(.*)/, '$2');
  // Also handle cases where it's just "01 Name" without dot
  name = name.replace(/^\d+\s+(.*)/, '$1');

  // Capitalize first letter of each word
  name = name.replace(/\w\S*/g, (w) => w.replace(/^\w/, (c) => c.toUpperCase()));
  return name;
}

// Format section names which could be like '01. Intro' into '1. Intro'
export function formatSectionName(name) {
  if (!name) return 'General';
  if (name === 'Episodes') return 'General';
  const match = name.match(/^(\d+)[\s\-\.]+(.*)/);
  if (match) {
    return `${parseInt(match[1])}. ${match[2]}`;
  }
  return name;
}
