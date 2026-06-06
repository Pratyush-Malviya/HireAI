import os
import re

TARGET_FILE = r'c:\Users\sony\OneDrive\Desktop\HireAI\src\components\LandingPage.tsx'

def patch_landing_page():
    if not os.path.exists(TARGET_FILE):
        print(f"File {TARGET_FILE} not found.")
        return

    with open(TARGET_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content = content

    # 1. Backgrounds
    new_content = new_content.replace('bg-[#0d1117]', 'bg-transparent')
    new_content = new_content.replace('from-indigo-900/30 via-[#0d1117] to-[#0d1117]', 'from-[#6366f1]/20 via-transparent to-transparent')
    
    # 2. Text styling
    new_content = new_content.replace('text-[#c9d1d9]', 'text-slate-300')
    new_content = new_content.replace('text-[#8b949e]', 'text-slate-400')
    
    # 3. Card replacements
    new_content = new_content.replace('bg-[#161b22]/50', 'glass-premium')
    new_content = new_content.replace('bg-[#161b22]', 'glass-premium')
    new_content = new_content.replace('border-white/5', 'border-white/10')
    new_content = new_content.replace('border-[#30363d]', 'border-white/10')
    
    # 4. Aurora animated gradient class for the main hero text
    hero_pattern = r'<span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">'
    new_hero = '<span className="text-transparent bg-clip-text bg-gradient-to-r from-[#6366f1] via-[#d946ef] to-[#6366f1] animate-gradient bg-[length:200%_auto]">'
    new_content = new_content.replace(hero_pattern, new_hero)
    
    # And for previous light mode variants
    hero_pattern2 = r'<span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600">'
    new_content = new_content.replace(hero_pattern2, new_hero)

    # 5. Buttons
    btn_pattern = r'bg-brand hover:bg-brand-dark'
    new_btn = 'bg-gradient-to-r from-[#6366f1] to-[#d946ef] hover:opacity-90 shadow-[0_0_20px_rgba(99,102,241,0.4)]'
    new_content = new_content.replace(btn_pattern, new_btn)

    if new_content != content:
        with open(TARGET_FILE, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("Successfully applied Premium Aurora layout patches to LandingPage.tsx")
    else:
        print("No changes made to LandingPage.tsx. Regex patterns might not have matched.")

if __name__ == '__main__':
    patch_landing_page()
