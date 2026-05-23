import sys

def main():
    with open('src/App.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Add state variable
    state_injection = "  const [orgWorkingHoursTimezone, setOrgWorkingHoursTimezone] = useState('UTC');"
    new_state = "  const [botSpeakingPace, setBotSpeakingPace] = useState<number>(1.0);"
    content = content.replace(state_injection, state_injection + '\n' + new_state)

    # 2. Add to useEffect initialization
    init_injection = "setOrgWorkingHoursTimezone(organization.workingHours?.timezone || 'UTC');"
    new_init = "      setBotSpeakingPace(organization.botSpeakingPace || 1.0);"
    content = content.replace(init_injection, init_injection + '\n' + new_init)

    # 3. Add to handleSaveSettings
    save_injection = "timezone: orgWorkingHoursTimezone\n        },"
    new_save = "timezone: orgWorkingHoursTimezone\n        },\n        botSpeakingPace: botSpeakingPace,"
    content = content.replace(save_injection, new_save)

    # 4. Add UI field inside Company Identity tab
    # Find the Official Working Hours section end
    ui_injection = """                  </select>
                </div>
              </div>
            </Card>"""
    new_ui = """                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <div className="mb-4">
                  <h4 className="font-bold text-slate-800 text-sm">Bot Speaking Pace</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Control how fast the AI interviewer speaks</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Slow', value: 0.8 },
                    { label: 'Normal', value: 1.0 },
                    { label: 'Fast', value: 1.2 }
                  ].map(pace => (
                    <button
                      key={pace.label}
                      type="button"
                      disabled={isReadOnly}
                      onClick={() => setBotSpeakingPace(pace.value)}
                      className={`py-2.5 rounded-xl text-xs font-bold transition-all border-2 ${botSpeakingPace === pace.value ? 'bg-indigo-50 border-indigo-600 text-indigo-700' : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-200'}`}
                    >
                      {pace.label}
                    </button>
                  ))}
                </div>
              </div>
            </Card>"""
    content = content.replace(ui_injection, new_ui)

    with open('src/App.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Done adding botSpeakingPace to OrgAdminPanel")

if __name__ == '__main__':
    main()
