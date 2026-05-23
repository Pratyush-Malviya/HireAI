import sys

def main():
    with open('src/App.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Add botSpeakingPace state to InterviewRoom
    state_injection = "  const [isKeyboardMode, setIsKeyboardMode] = useState(false);"
    new_state = "  const [botSpeakingPace, setBotSpeakingPace] = useState(1.05);"
    content = content.replace(state_injection, state_injection + '\n' + new_state)

    # 2. Fetch Organization botSpeakingPace
    fetch_injection = "getDoc(doc(db, 'jobs', c.jobId)).then(jd => jd.exists() && setJob({ id: jd.id, ...jd.data() } as Job)).catch(err => handleFirestoreError(err, OperationType.GET, `jobs/${c.jobId}`));"
    new_fetch = """        getDoc(doc(db, 'jobs', c.jobId)).then(jd => jd.exists() && setJob({ id: jd.id, ...jd.data() } as Job)).catch(err => handleFirestoreError(err, OperationType.GET, `jobs/${c.jobId}`));
        if (c.organizationId) {
          getDoc(doc(db, 'organizations', c.organizationId)).then(orgD => {
            if (orgD.exists()) {
              const org = orgD.data();
              if (org.botSpeakingPace !== undefined) {
                setBotSpeakingPace(org.botSpeakingPace);
              }
            }
          }).catch(err => console.error(err));
        }"""
    content = content.replace(fetch_injection, new_fetch)

    # 3. Update SpeechSynthesisUtterance rate
    rate_injection = "utterance.rate = 1.05; // Slightly faster for responsiveness"
    new_rate = "utterance.rate = botSpeakingPace; // Configured via HR Admin or defaults to 1.05"
    content = content.replace(rate_injection, new_rate)

    with open('src/App.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Done adding pace support to InterviewRoom")

if __name__ == '__main__':
    main()
