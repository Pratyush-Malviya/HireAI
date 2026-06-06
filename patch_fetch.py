import re
import os

APP_FILE = r'c:\Users\sony\OneDrive\Desktop\HireAI\src\App.tsx'

def patch_frontend_fetch():
    with open(APP_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    # Patch /api/composio/status
    composio_status_old = """      fetch(`/api/composio/status?userId=${profile.uid}`)
          .then(r => r.json())
          .then(data => {
            setComposioConnected(!!data.connected);
          })
          .catch(console.error);"""

    composio_status_new = """      fetch(`/api/composio/status?userId=${profile.uid}`)
          .then(async r => {
            if (!r.ok) {
              const text = await r.text();
              throw new Error(`API error: ${text}`);
            }
            return r.json();
          })
          .then(data => {
            setComposioConnected(!!data.connected);
          })
          .catch(console.error);"""
          
    content = content.replace(composio_status_old, composio_status_new)

    # Patch /api/calendar/status
    calendar_status_old = """    fetch('/api/calendar/status')
        .then(r => r.json())
        .then(data => {
          setCalendarConnected(data.connected);
          if (data.config) setCalendarConfig(data.config);
        })
        .catch(console.error);"""

    calendar_status_new = """    fetch('/api/calendar/status')
        .then(async r => {
            if (!r.ok) {
              const text = await r.text();
              throw new Error(`API error: ${text}`);
            }
            return r.json();
        })
        .then(data => {
          setCalendarConnected(data.connected);
          if (data.config) setCalendarConfig(data.config);
        })
        .catch(console.error);"""
        
    content = content.replace(calendar_status_old, calendar_status_new)
    
    # Patch /api/composio/connect
    composio_connect_old = """      const response = await fetch('/api/composio/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: profile.uid,
            callbackUrl: window.location.href
          })
        });
        const data = await response.json();"""

    composio_connect_new = """      const response = await fetch('/api/composio/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: profile.uid,
            callbackUrl: window.location.href
          })
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`API error: ${text}`);
        }
        const data = await response.json();"""
        
    content = content.replace(composio_connect_old, composio_connect_new)
    
    # Patch recording status
    recording_status_old = """        const res = await fetch(`/api/meeting/recording-status/${candidate.id}`);
        const data = await res.json();"""
        
    recording_status_new = """        const res = await fetch(`/api/meeting/recording-status/${candidate.id}`);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`API error: ${text}`);
        }
        const data = await res.json();"""
        
    content = content.replace(recording_status_old, recording_status_new)

    with open(APP_FILE, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patched frontend fetch calls for robust JSON handling.")

if __name__ == '__main__':
    patch_frontend_fetch()
