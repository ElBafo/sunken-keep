// Log message templates from log.json

interface LogEntry {
  key: string;
  text: string;
  when?: string;
}

let logEntries: Map<string, string> = new Map();

export async function loadLogMessages() {
  try {
    const response = await fetch('/sunken-keep/log.json');
    const entries: LogEntry[] = await response.json();
    
    entries.forEach(entry => {
      logEntries.set(entry.key, entry.text);
    });
    
    console.log(`Loaded ${logEntries.size} log messages`);
  } catch (error) {
    console.error('Failed to load log messages:', error);
  }
}

export function getLogMessage(key: string, replacements?: { [key: string]: string | number }): string {
  let text = logEntries.get(key);
  
  if (!text) {
    console.warn(`Log message not found: ${key}`);
    return `[${key}]`;
  }
  
  if (replacements) {
    for (const [placeholder, value] of Object.entries(replacements)) {
      text = text.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), String(value));
    }
  }
  
  return text;
}

export function hasLogMessage(key: string): boolean {
  return logEntries.has(key);
}
