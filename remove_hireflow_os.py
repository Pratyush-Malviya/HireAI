import sys

def main():
    with open('src/App.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # Remove state variables
    state_start = content.find('  // White-Label Customization States')
    state_end = content.find('  const isReadOnly = profile?.role === \'recruiter\';')
    if state_start != -1 and state_end != -1:
        content = content[:state_start] + content[state_end:]
        print("Removed state variables")
    else:
        print("Could not find state variables")

    # Remove UI block
    ui_start = content.find('          {/* White-Label Customization Workspace Panel */}')
    ui_end = content.find('          {/* Action Controls */}')
    if ui_start != -1 and ui_end != -1:
        content = content[:ui_start] + content[ui_end:]
        print("Removed UI block")
    else:
        print("Could not find UI block")

    with open('src/App.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Done")

if __name__ == '__main__':
    main()
