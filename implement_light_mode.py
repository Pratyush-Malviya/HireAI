import os
import re

TARGET_DIR = r'c:\Users\sony\OneDrive\Desktop\HireAI\src'

def implement_light_mode():
    for root, dirs, files in os.walk(TARGET_DIR):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.ts'):
                filepath = os.path.join(root, file)
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()

                new_content = content
                
                # Convert Text Colors
                # We want to replace text-white with text-slate-900, UNLESS it's a button.
                # A safer approach is to replace text-white everywhere, then add text-white back to buttons.
                new_content = new_content.replace('text-white', 'text-slate-900')
                new_content = new_content.replace('text-slate-100', 'text-slate-800')
                new_content = new_content.replace('text-slate-200', 'text-slate-600')
                new_content = new_content.replace('text-slate-300', 'text-slate-500')
                new_content = new_content.replace('text-slate-400', 'text-slate-500')
                
                # Convert Background and Border overlays
                new_content = new_content.replace('border-white/10', 'border-slate-200')
                new_content = new_content.replace('border-white/20', 'border-slate-300')
                new_content = new_content.replace('border-[#e6edf3]/80', 'border-slate-200')
                new_content = new_content.replace('border-[#e6edf3]/60', 'border-slate-200')
                new_content = new_content.replace('border-[#e6edf3]', 'border-slate-200')
                new_content = new_content.replace('border-slate-900/10', 'border-slate-200')
                
                new_content = new_content.replace('bg-white/5', 'bg-slate-50')
                new_content = new_content.replace('bg-white/10', 'bg-slate-100')
                new_content = new_content.replace('bg-slate-900/40', 'bg-white/80')
                new_content = new_content.replace('bg-slate-800/40', 'bg-white/90')
                
                # Convert specific hover states
                new_content = new_content.replace('hover:text-white', 'hover:text-brand')
                new_content = new_content.replace('hover:bg-[#30363d]', 'hover:bg-slate-100')
                new_content = new_content.replace('hover:bg-white/5', 'hover:bg-slate-50')
                
                # Fix buttons back to text-white
                new_content = re.sub(r'(<button[^>]*className="[^"]*)text-slate-900([^"]*bg-brand[^"]*>)', r'\1text-white\2', new_content)
                new_content = re.sub(r'(<button[^>]*className="[^"]*)text-slate-900([^"]*bg-gradient[^"]*>)', r'\1text-white\2', new_content)
                # For `glass-premium` buttons that should be filled
                new_content = re.sub(r'(<button[^>]*className="[^"]*glass-premium[^"]*)text-slate-900', r'\1text-brand', new_content)
                new_content = re.sub(r'(<a[^>]*className="[^"]*glass-premium[^"]*)text-slate-900', r'\1text-brand', new_content)
                
                # The big Start Free Trial button in App.tsx might need specific targeting
                new_content = new_content.replace('bg-brand text-slate-900', 'bg-brand text-white')
                
                if new_content != content:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Implemented Light Mode in {file}")

if __name__ == '__main__':
    implement_light_mode()
