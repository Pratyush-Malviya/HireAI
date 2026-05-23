import re

def main():
    with open('src/App.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # Replacements
    content = content.replace("HireFlow OS Portal", "HireNow Portal")
    content = content.replace("HireFlow OS Inc.", "HireNow Inc.")
    content = content.replace("HireFlow OS", "HireNow")
    content = content.replace("HIREFLOW OS", "HIRENOW")
    content = content.replace("HireFlow.OS", "HireNow")
    content = content.replace("HireFlow", "HireNow")
    content = content.replace("HIREFLOW", "HIRENOW")
    content = content.replace("hireflow-os-engine", "hirenow-engine")
    
    # We should fix the specific component piece where we did:
    # <span className="font-display font-black text-2xl tracking-tighter text-white">HireFlow<span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">.OS</span></span>
    # which we replaced above but it might look weird: `HireNow<span...>.OS</span>`?
    # Let's fix that markup properly:
    content = content.replace(
        '<span className="font-display font-black text-2xl tracking-tighter text-white">HireNow<span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">.OS</span></span>',
        '<span className="font-display font-black text-2xl tracking-tighter text-white">Hire<span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">Now</span></span>'
    )
    # Wait, because of previous replace "HireFlow.OS" -> "HireNow" it might be modified already.
    # Actually `content.replace("HireFlow", "HireNow")` turns `HireFlow<span...>.OS</span>` into `HireNow<span...>.OS</span>`. Let's handle that exact string before the generic replacement.

    # Let's start over with the raw string
    with open('src/App.tsx', 'r', encoding='utf-8') as f:
        raw = f.read()
    
    # Custom markup fix
    raw = raw.replace(
        '<span className="font-display font-black text-2xl tracking-tighter text-white">HireFlow<span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">.OS</span></span>',
        '<span className="font-display font-black text-2xl tracking-tighter text-white">Hire<span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">Now</span></span>'
    )
    
    raw = raw.replace("HireFlow OS Portal", "HireNow Portal")
    raw = raw.replace("HireFlow OS Inc.", "HireNow Inc.")
    raw = raw.replace("HireFlow OS", "HireNow")
    raw = raw.replace("HIREFLOW OS", "HIRENOW")
    raw = raw.replace("hireflow-os-engine", "hirenow-engine")
    raw = raw.replace("HireFlow", "HireNow")
    raw = raw.replace("HIREFLOW", "HIRENOW")

    with open('src/App.tsx', 'w', encoding='utf-8') as f:
        f.write(raw)
    
    print("Done renaming")

if __name__ == '__main__':
    main()
