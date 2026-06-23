import React, { useState } from 'react';
import { useProfile } from '../lib/appContext';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useNotification } from '../lib/appContext';
import { MessageSquare, Send, Loader2, Star } from 'lucide-react';
import { cn } from '../lib/utils';

export function FeedbackPage() {
  const { profile, organization } = useProfile();
  const { notify } = useNotification();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim() || rating === 0) {
      notify('Please fill all fields and provide a rating.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'feedbacks'), {
        userId: profile?.uid || 'unknown',
        userEmail: profile?.email || 'unknown',
        userName: profile?.fullName || 'unknown',
        organizationId: profile?.organizationId || 'none',
        organizationName: organization?.name || 'none',
        subject,
        message,
        rating,
        createdAt: serverTimestamp(),
      });
      notify('Feedback submitted successfully! Thank you.', 'success');
      setSubject('');
      setMessage('');
      setRating(0);
    } catch (err: any) {
      console.error('Error submitting feedback:', err);
      notify(err.message || 'Failed to submit feedback.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <div className="p-2.5 bg-brand/10 text-brand rounded-xl">
              <MessageSquare className="w-6 h-6" />
            </div>
            Platform Feedback
          </h1>
          <p className="text-slate-400 mt-2 text-sm font-medium">We'd love to hear your thoughts, suggestions, and feedback to improve HireNow.</p>
        </div>
      </div>

      <div className="p-6 glass-premium rounded-2xl border border-white/10">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-wider text-slate-400">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="E.g., Feature request, Bug report, General feedback"
              className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-wider text-slate-400">Your Feedback</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what you think..."
              rows={6}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand resize-y"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-wider text-slate-400">Overall Experience</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="p-1 hover:scale-110 transition-transform"
                >
                  <Star className={cn("w-8 h-8", rating >= star ? "fill-amber-400 text-amber-400" : "text-slate-600")} />
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-white/5 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-11 px-8 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-brand to-brand-light hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Submit Feedback
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
