import os

TARGET_DIR = r'c:\Users\sony\OneDrive\Desktop\HireAI\src'

def brighten_text():
    for root, dirs, files in os.walk(TARGET_DIR):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.ts'):
                filepath = os.path.join(root, file)
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()

                new_content = content
                
                # Make all grays significantly brighter for dark mode
                new_content = new_content.replace('text-slate-400', 'text-slate-200')
                new_content = new_content.replace('text-slate-500', 'text-slate-300')
                new_content = new_content.replace('text-slate-600', 'text-slate-300')
                new_content = new_content.replace('text-slate-700', 'text-slate-200')
                new_content = new_content.replace('text-slate-800', 'text-white')
                new_content = new_content.replace('text-slate-900', 'text-white')
                new_content = new_content.replace('text-slate-950', 'text-white')
                
                # Make brand colors brighter
                new_content = new_content.replace('text-brand-dark', 'text-brand-light')
                
                # Also fix hover states
                new_content = new_content.replace('hover:text-slate-400', 'hover:text-slate-200')
                
                if new_content != content:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Brightened text in {file}")

if __name__ == '__main__':
    brighten_text()
