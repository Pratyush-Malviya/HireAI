import re
import os

def main():
    file_path = 'src/App.tsx'
    if not os.path.exists(file_path):
        print(f"File {file_path} not found.")
        return
        
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Remove the theme context and state management
    # Change: const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as 'light' | 'dark') || 'light');
    # to just hardcode theme = 'light' if we want, but it's easier to just remove the document.documentElement.classList.add('dark') block.
    
    # Let's find the sync theme effect:
    effect_pattern = r"// Sync theme to DOM class list.*?\}, \[theme\]\);"
    content = re.sub(effect_pattern, "", content, flags=re.DOTALL)
    
    # 2. Remove any theme toggle buttons.
    # Typical toggle: 
    # <button ... onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} ... >
    #   {theme === 'dark' ? <Sun ... /> : <Moon ... />}
    # </button>
    # We can match `<button` up to `</button>` where `setTheme` is inside.
    button_pattern = r"<button[^>]*onClick=\{[^}]*setTheme\([^}]*?\}[^>]*>.*?</button>"
    content = re.sub(button_pattern, "", content, flags=re.DOTALL)
    
    # In case there are `div` toggles or other elements:
    div_pattern = r"<div[^>]*onClick=\{[^}]*setTheme\([^}]*?\}[^>]*>.*?</div>"
    content = re.sub(div_pattern, "", content, flags=re.DOTALL)

    # 3. Clean up the ProfileContext to just provide theme: 'light' statically if needed, 
    # but removing the button and the effect is enough to keep it permanently in light mode.
    # The default state is 'light' (or derived from localStorage). If the user had 'dark' in localStorage,
    # it won't be applied to document.documentElement because we removed the effect!
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
        
    print("Dark mode JS logic removed.")

if __name__ == '__main__':
    main()
