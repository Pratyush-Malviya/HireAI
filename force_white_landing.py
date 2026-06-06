import os
import re

APP_FILE = r'c:\Users\sony\OneDrive\Desktop\HireAI\src\App.tsx'
LANDING_FILE = r'c:\Users\sony\OneDrive\Desktop\HireAI\src\components\LandingPage.tsx'

def force_white_landing():
    # 1. Update LandingPage.tsx
    if os.path.exists(LANDING_FILE):
        with open(LANDING_FILE, 'r', encoding='utf-8') as f:
            lp_content = f.read()
        
        lp_new = re.sub(r'text-slate-\d00', 'text-white', lp_content)
        lp_new = lp_new.replace('text-brand-light', 'text-white')
        
        if lp_new != lp_content:
            with open(LANDING_FILE, 'w', encoding='utf-8') as f:
                f.write(lp_new)
            print("Forced text-white in LandingPage.tsx")

    # 2. Update the hardcoded Landing Page in App.tsx
    if os.path.exists(APP_FILE):
        with open(APP_FILE, 'r', encoding='utf-8') as f:
            app_content = f.read()

        # The Landing Page in App.tsx is generally when `if (!profile && !loading)`
        # It starts around the `<header className="glass-premium mb-4 px-6 py-4 flex items-center justify-between sticky top-0 z-40">`
        # and ends around the Simulation section.
        
        # To be safe, we can regex replace text-slate-* inside the specific tags we know are in the landing page.
        # But an easier way is to find the exact block. Let's look for "Autonomous Talent Lobby Live" and replace around it.
        
        # Let's just do a targeted replacement for the known strings in the App.tsx Landing Page
        replacements = [
            # Nav links
            (r'text-xs font-black text-slate-\d00 hover:text-white', r'text-xs font-black text-white hover:text-white'),
            (r'text-xs font-bold text-slate-\d00 hover:text-white', r'text-xs font-bold text-white hover:text-white'),
            
            # Badges
            (r'text-\[10px\] font-black uppercase tracking-wider text-slate-\d00', r'text-[10px] font-black uppercase tracking-wider text-white'),
            
            # Subtexts
            (r'text-base sm:text-lg text-slate-\d00 max-w-2xl mx-auto mb-12 leading-relaxed', r'text-base sm:text-lg text-white max-w-2xl mx-auto mb-12 leading-relaxed'),
            (r'text-slate-\d00 max-w-2xl mx-auto text-sm leading-relaxed', r'text-white max-w-2xl mx-auto text-sm leading-relaxed'),
            
            # Ticker text
            (r'text-center text-\[10px\] font-black uppercase tracking-widest text-slate-\d00', r'text-center text-[10px] font-black uppercase tracking-widest text-white'),
            (r'whitespace-nowrap text-slate-\d00', r'whitespace-nowrap text-white'),
            
            # Main hero text
            (r'<span className="text-slate-\d00">Autonomous AI Interviews.</span>', r'<span className="text-white">Autonomous AI Interviews.</span>'),
            (r'<span className="text-brand-light">Autonomous AI Interviews.</span>', r'<span className="text-white">Autonomous AI Interviews.</span>'),
            
            # "Watch Simulation" button
            (r'glass-premium text-slate-\d00 text-xs font-black', r'glass-premium text-white text-xs font-black'),
            (r'glass-premium text-slate-\d00 text-xs font-bold', r'glass-premium text-white text-xs font-bold'),
        ]
        
        app_new = app_content
        for old, new in replacements:
            app_new = re.sub(old, new, app_new)
            
        if app_new != app_content:
            with open(APP_FILE, 'w', encoding='utf-8') as f:
                f.write(app_new)
            print("Forced text-white in App.tsx Landing Page sections")
        else:
            print("No changes made to App.tsx")

if __name__ == '__main__':
    force_white_landing()
