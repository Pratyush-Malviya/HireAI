import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'

export function ComposioCallback() {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const statusParam = params.get('status')
    const connectedAccountId = params.get('connectedAccountId')
    const accountEmail = params.get('accountEmail')

    if (statusParam === 'success' && window.opener) {
      window.opener.postMessage({
        type: 'COMPOSIO_OAUTH_SUCCESS',
        status: 'success',
        connectedAccountId,
        accountEmail
      }, window.location.origin)
      setStatus('success')
      setMessage('Google Calendar connected successfully!')
      setTimeout(() => window.close(), 2000)
    } else if (statusParam === 'error') {
      const errorMsg = params.get('message') || 'Authorization failed'
      if (window.opener) {
        window.opener.postMessage({
          type: 'COMPOSIO_OAUTH_ERROR',
          status: 'error',
          error: errorMsg
        }, window.location.origin)
      }
      setStatus('error')
      setMessage(errorMsg)
    } else {
      if (window.opener) {
        window.opener.postMessage({
          type: 'COMPOSIO_OAUTH_SUCCESS',
          status: 'success',
          connectedAccountId,
          accountEmail
        }, window.location.origin)
      }
      setStatus('success')
      setMessage('Google Calendar connected successfully!')
      setTimeout(() => window.close(), 2000)
    }
  }, [])

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-teal-100 via-sky-200 to-indigo-200">
      <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-10 max-w-md w-full mx-4 text-center border border-white/50">
        {status === 'processing' && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-indigo-500 mx-auto mb-4" />
            <p className="text-lg font-bold text-gray-800">Processing...</p>
            <p className="text-sm text-gray-500 mt-2">Completing Google Calendar connection</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <p className="text-lg font-bold text-gray-800">{message}</p>
            <p className="text-sm text-gray-500 mt-3">You can close this window</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <p className="text-lg font-bold text-gray-800">Connection Failed</p>
            <p className="text-sm text-gray-500 mt-2">{message}</p>
            <button
              onClick={() => window.close()}
              className="mt-4 px-6 py-2 bg-indigo-500 text-white rounded-xl text-sm font-bold hover:bg-indigo-600 transition-colors"
            >
              Close Window
            </button>
          </>
        )}
      </div>
    </div>
  )
}
