import React, { useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { MessageSquare, Star, Clock, User, Building } from 'lucide-react';
import { formatDateTime } from '../../lib/utils';
import { cn } from '../../lib/utils';

interface Feedback {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  organizationId: string;
  organizationName: string;
  subject: string;
  message: string;
  rating: number;
  createdAt: any;
}

export function SAFeedbackPage() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFeedbacks() {
      try {
        const q = query(collection(db, 'feedbacks'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Feedback));
        setFeedbacks(data);
      } catch (err) {
        console.error('Error loading feedbacks', err);
      } finally {
        setLoading(false);
      }
    }
    loadFeedbacks();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <div className="p-2.5 bg-brand/10 text-brand rounded-xl">
              <MessageSquare className="w-6 h-6" />
            </div>
            User Feedback
          </h1>
          <p className="text-slate-400 mt-2 text-sm font-medium">Review platform feedback submitted by users.</p>
        </div>
      </div>

      <Card className="p-6 glass-premium">
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-12 bg-white/5 rounded-xl w-full"></div>
            <div className="h-12 bg-white/5 rounded-xl w-full"></div>
            <div className="h-12 bg-white/5 rounded-xl w-full"></div>
          </div>
        ) : feedbacks.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No feedback captured yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {feedbacks.map((item) => (
              <div key={item.id} className="p-4 bg-slate-900/50 border border-white/5 rounded-xl hover:border-brand/30 transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{item.subject}</span>
                    <span className="flex text-amber-400">
                      {[...Array(item.rating)].map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-current" />
                      ))}
                    </span>
                  </div>
                  <div className="flex items-center text-xs text-slate-500 gap-1 font-mono">
                    <Clock className="w-3 h-3" />
                    {item.createdAt?.toDate ? formatDateTime(item.createdAt.toDate()) : 'Recent'}
                  </div>
                </div>

                <p className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed mb-4">
                  {item.message}
                </p>

                <div className="flex items-center gap-4 text-[10px] uppercase tracking-wider font-bold text-slate-500 border-t border-white/5 pt-3 mt-3">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    <span className="text-slate-400">{item.userName} ({item.userEmail})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5" />
                    <span className="text-slate-400">{item.organizationName}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
