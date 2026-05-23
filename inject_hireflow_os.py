import sys

def main():
    with open('src/App.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # Add 'white-label' to the activeTab type
    tab_def_old = "const activeTab = (searchParams.get('tab') as 'overview' | 'organizations' | 'payments' | 'integrations' | 'manual') || 'overview';"
    tab_def_new = "const activeTab = (searchParams.get('tab') as 'overview' | 'organizations' | 'payments' | 'integrations' | 'manual' | 'white-label') || 'overview';"
    content = content.replace(tab_def_old, tab_def_new)

    # Inject the state variables inside SuperAdminPanel
    state_injection_point = "  const [onboardModalOpen, setOnboardModalOpen] = useState(false);"
    state_vars = """
  // HireFlow OS White-Label & Reseller States
  const [logoUrl, setLogoUrl] = useState('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=120&q=80');
  const [primaryColor, setPrimaryColor] = useState('#4f46e5');
  const [brandingName, setBrandingName] = useState('HireFlow OS Portal');
  const [markupFactor, setMarkupFactor] = useState(1.35);
  const [resellerModel, setResellerModel] = useState<'per_seat' | 'per_interview'>('per_interview');
  const [clientTenants, setClientTenants] = useState([
    { id: 'ct-1', name: 'Zeta Software Solutions', jobs: 6, candidates: 184, billableAmt: 5400, markup: 1.30 },
    { id: 'ct-2', name: 'Stellar Tech Labs', jobs: 3, candidates: 49, billableAmt: 1950, markup: 1.40 },
    { id: 'ct-3', name: 'Infinity Healthcare Corp', jobs: 8, candidates: 298, billableAmt: 11200, markup: 1.25 }
  ]);
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [editingTenantName, setEditingTenantName] = useState('');
  const [editingTenantMarkup, setEditingTenantMarkup] = useState(1.35);
"""
    content = content.replace(state_injection_point, state_vars + '\n' + state_injection_point)

    # Inject the Tab Button
    tab_buttons_point = """            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
              {['overview', 'organizations', 'payments', 'integrations', 'manual'].map((tab) => ("""
    
    new_tab_buttons_point = """            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
              {['overview', 'organizations', 'payments', 'integrations', 'white-label', 'manual'].map((tab) => ("""
    content = content.replace(tab_buttons_point, new_tab_buttons_point)

    # Inject the Tab Content
    # First, let's find the closing tag of the tabs area in SuperAdminPanel
    # It might be easier to just inject it right before `</main>` or something inside SuperAdminPanel.
    # But wait, SuperAdminPanel has `{activeTab === 'overview' && ...}` blocks.
    
    # Let's search for `{activeTab === 'manual' && (`
    manual_tab_start = "{activeTab === 'manual' && ("
    
    white_label_ui = """
        {activeTab === 'white-label' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card className="p-8 space-y-6 bg-white border border-slate-100 shadow-sm rounded-3xl text-left">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                    <Sliders className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 uppercase text-sm tracking-wide">Brand customizer</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">White-Label Portal Customization Settings</p>
                  </div>
                </div>
  
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Interactive Portal Brand Name</label>
                    <input
                      type="text"
                      value={brandingName}
                      onChange={e => setBrandingName(e.target.value)}
                      placeholder="e.g. HireFlow Pro"
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all text-xs"
                    />
                  </div>
  
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Corporate Branding Logo URL</label>
                    <input
                      type="text"
                      value={logoUrl}
                      onChange={e => setLogoUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all text-xs"
                    />
                  </div>
  
                  <div className="space-y-1.5 pt-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3">Primary Color Scheme Accent</label>
                    <div className="grid grid-cols-5 gap-3">
                      {[
                        { name: 'Indigo', value: '#4f46e5' },
                        { name: 'Mint', value: '#10b981' },
                        { name: 'Crimson', value: '#e11d48' },
                        { name: 'Amber', value: '#f59e0b' },
                        { name: 'Classic', value: '#0f172a' },
                        { name: 'Orchid', value: '#c026d3' }
                      ].map(color => (
                        <button
                          key={color.name}
                          type="button"
                          onClick={() => setPrimaryColor(color.value)}
                          className={`w-full aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${primaryColor === color.value ? 'border-slate-900 scale-110 shadow-lg' : 'border-transparent hover:scale-105 shadow-sm'}`}
                          style={{ backgroundColor: color.value }}
                        >
                          <span className="text-[8px] font-black text-white uppercase tracking-widest opacity-90 mix-blend-overlay">{color.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
  
              <Card className="p-8 space-y-6 bg-white border border-slate-100 shadow-sm rounded-3xl text-left">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 uppercase text-sm tracking-wide">Enterprise Reseller Parameters</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">SaaS Markup & Billing Profiles</p>
                  </div>
                </div>
  
                <div className="space-y-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-between">
                      <span>Licensing Fee Markup Factor</span>
                      <span className="text-indigo-600 font-bold text-xs">{markupFactor.toFixed(2)}x</span>
                    </label>
                    <input 
                      type="range"
                      min="1.0"
                      max="3.0"
                      step="0.05"
                      value={markupFactor}
                      onChange={e => setMarkupFactor(parseFloat(e.target.value))}
                      className="w-full accent-indigo-600"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Client Reseller Model</label>
                    <div className="flex bg-slate-50 p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setResellerModel('per_interview')}
                        className={`flex-1 py-2 px-3 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${resellerModel === 'per_interview' ? 'bg-white text-slate-900 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        Per Candidate voice screening ($)
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
  
            <Card className="p-8 space-y-6 bg-slate-900 border-none shadow-xl rounded-3xl text-left overflow-hidden relative">
              <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/carbon-fibre.png")' }}></div>
              <div className="relative z-10">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
                  <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg" style={{ backgroundColor: primaryColor }}>
                        <LayoutGrid className="w-5 h-5 text-white" />
                     </div>
                     <div>
                       <h3 className="font-black text-white uppercase text-sm tracking-wide">Custom white label preview</h3>
                       <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Live Render Portal Mockup</p>
                     </div>
                  </div>
                  <div className="px-3 py-1 bg-green-500/20 border border-green-500/30 rounded-full flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                    <span className="text-[10px] font-black text-green-400 uppercase tracking-widest">ACTIVE CUSTOMIZER</span>
                  </div>
                </div>
                
                <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
                   <div className="h-14 border-b border-slate-800 flex items-center px-6 justify-between bg-slate-900/50">
                      <div className="flex items-center gap-3">
                        <img src={logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-cover bg-slate-800" onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/150'; }} />
                        <span className="font-black text-white uppercase tracking-tight text-sm">{brandingName}</span>
                      </div>
                      <div className="flex items-center gap-4 hidden sm:flex">
                         <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Assesments</span>
                         <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Candidates</span>
                         <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Settings</span>
                      </div>
                   </div>
                   <div className="p-8 sm:p-12 text-center space-y-6 relative overflow-hidden bg-gradient-to-b from-slate-900 to-slate-950">
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 blur-[100px] rounded-full opacity-20 pointer-events-none" style={{ backgroundColor: primaryColor }}></div>
                      
                      <div className="relative z-10 max-w-lg mx-auto space-y-4">
                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Welcome to your Automated screening Lobby</h2>
                        <p className="text-xs font-medium text-slate-400 leading-relaxed">
                          Powered under secure sandbox protocols. All transcripts and audio evaluation logs are analyzed securely with dynamic pricing variables.
                        </p>
                        <Button className="mt-4 shadow-lg text-white font-black uppercase tracking-widest text-[10px] px-8 h-12" style={{ backgroundColor: primaryColor }}>
                           Enter Assessment Lobby
                        </Button>
                      </div>
                   </div>
                   <div className="h-10 border-t border-slate-800 flex items-center px-6 justify-between bg-slate-900/80">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">© 2026 {brandingName} Portal Client Isolation</span>
                   </div>
                </div>
              </div>
            </Card>
  
            <Card className="p-8 space-y-6 bg-white border border-slate-100 shadow-sm rounded-3xl text-left overflow-x-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 min-w-max">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                    <Users className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 uppercase text-sm tracking-wide">Multi-Tenant Client Workspaces Matrix</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Reseller Client Billing Profiles & Consumption Dashboard</p>
                  </div>
                </div>
                <Button variant="outline" className="h-9 text-[10px] font-black uppercase tracking-widest border-indigo-100 text-indigo-600 hover:bg-indigo-50">
                  <Plus className="w-3.5 h-3.5 mr-2" /> Add Client Workspace
                </Button>
              </div>
  
              <div className="overflow-x-auto min-w-max">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Client Organization Name</th>
                      <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Jobs Ordered</th>
                      <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Screened Evaluated</th>
                      <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Raw Platform Usage</th>
                      <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Reseller Markup Mode</th>
                      <th className="pb-3 text-[10px] font-black text-slate-900 uppercase tracking-widest text-right">CLIENT BILLABLE TOTAL</th>
                      <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {clientTenants.map(ten => (
                       <tr key={ten.id} className="group hover:bg-slate-50/50 transition-colors">
                         <td className="py-4">
                           <div className="font-bold text-slate-900 text-xs">{editingTenantId === ten.id ? (
                             <input type="text" value={editingTenantName} onChange={e => setEditingTenantName(e.target.value)} className="border p-1 text-xs" />
                           ) : ten.name}</div>
                           <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">WORKSPACE_ID: {ten.id}</div>
                         </td>
                         <td className="py-4 text-xs font-bold text-slate-600">{ten.jobs}</td>
                         <td className="py-4 text-xs font-bold text-slate-600">{ten.candidates}</td>
                         <td className="py-4 text-xs font-medium text-slate-500">${ten.billableAmt.toFixed(2)}</td>
                         <td className="py-4 text-xs font-bold text-indigo-600">
                           {editingTenantId === ten.id ? (
                              <input 
                                type="number" 
                                step="0.05" 
                                min={1.0}
                                value={editingTenantMarkup}
                                onChange={(e) => setEditingTenantMarkup(Number(e.target.value))}
                                className="w-16 p-1 rounded border border-indigo-200 text-center font-bold"
                              />
                           ) : `${ten.markup.toFixed(2)}x combined`}
                         </td>
                         <td className="py-4 text-xs font-black text-slate-900 text-right bg-slate-50/50 rounded-r-xl">
                           ${(ten.billableAmt * ten.markup * markupFactor).toFixed(2)}
                         </td>
                         <td className="py-4 text-right">
                           {editingTenantId === ten.id ? (
                              <button 
                                className="text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:text-emerald-700"
                                onClick={() => {
                                  setClientTenants(prev => prev.map(p => p.id === ten.id ? { ...p, name: editingTenantName, markup: editingTenantMarkup } : p));
                                  setEditingTenantId(null);
                                }}
                              >Save</button>
                           ) : (
                             <div className="flex items-center justify-end gap-2">
                               <button 
                                 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-700 opacity-0 group-hover:opacity-100 transition-opacity"
                                 onClick={() => {
                                  setEditingTenantId(ten.id);
                                  setEditingTenantName(ten.name);
                                  setEditingTenantMarkup(ten.markup);
                                 }}
                               >Edit</button>
                               <span className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">|</span>
                               <button className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">Suspend</button>
                             </div>
                           )}
                         </td>
                       </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pt-4 border-t border-slate-100 mt-2">
                <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                  <strong className="text-slate-600">Calculation Audit ledger Logic:</strong> Combined pricing is automatically derived via the dynamic equation: <code>Billable CTC = usageUnitCount * unitCostPrice * ResellerMarkupMultiplier * clientSpecificFactor</code>. All invoices are isolate-persisted inside the client workspace domains respectively.
                </p>
              </div>
            </Card>
          </div>
        )}
"""
    content = content.replace(manual_tab_start, white_label_ui + '\n' + manual_tab_start)

    with open('src/App.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Done")

if __name__ == '__main__':
    main()
