'use client';

import Link from 'next/link';
import {
  HelpCircle, MessageSquare, Facebook, Package,
  Settings, Mail, ArrowRight, ExternalLink, Sparkles
} from 'lucide-react';

export default function HelpPage() {
  const faqs = [
    {
      question: 'AI чатбот хэрхэн ажилладаг вэ?',
      answer: 'Vertmon Hub AI чатбот нь таны Facebook Page-тэй холбогдож, Messenger-ээр ирсэн мессежүүдэд автоматаар хариулна. Google Gemini AI ашиглан хэрэглэгчийн асуултад зөв хариулт өгнө.'
    },
    {
      question: 'Facebook Page-ээ хэрхэн холбох вэ?',
      answer: 'Тохиргоо хуудсанд орж "Facebook-ээр холбох" товчийг дарна уу. Facebook бүртгэлээрээ нэвтэрч, чатбот ажиллуулах Page-ээ сонгоно.'
    },
    {
      question: 'Бүтээгдэхүүн нэмж болох уу?',
      answer: 'Тийм! Dashboard дээрх "Бүтээгдэхүүн" хэсэгт орж шинэ бүтээгдэхүүн нэмэх боломжтой. Чатбот эдгээр бүтээгдэхүүнүүдийг харилцагчдад танилцуулна.'
    },
    {
      question: 'Захиалга хэрхэн үүсдэг вэ?',
      answer: 'Харилцагч Messenger-ээр бүтээгдэхүүн захиалахад системд автоматаар захиалга бүртгэгдэнэ. Dashboard дээр захиалгуудыг удирдах боломжтой.'
    },
    {
      question: 'Чатбот ажиллахгүй байна?',
      answer: 'Facebook Page зөв холбогдсон эсэхийг шалгана уу. Тохиргоо хуудсанд очиж "Чатбот идэвхтэй" гэсэн тэмдэглэгээ байгаа эсэхийг шалгаарай.'
    },
  ];

  return (
    <div className="min-h-screen bg-surface-2/40">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-violet-600 to-indigo-700 text-white">
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <div className="w-20 h-20 bg-surface/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <HelpCircle className="w-10 h-10" />
          </div>
          <h1 className="text-4xl font-bold mb-4">Тусламж & FAQ</h1>
          <p className="text-xl text-violet-100">Vertmon Hub ашиглахад тусламж хэрэгтэй юу?</p>
        </div>
      </div>

      {/* Quick Links */}
      <div className="max-w-4xl mx-auto px-6 -mt-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/setup"
            className="bg-surface rounded-xl p-6 shadow-lg hover:shadow-xl transition-all border border-border/60 group"
          >
            <div className="w-12 h-12 bg-status-info-soft rounded-xl flex items-center justify-center mb-4">
              <Facebook className="w-6 h-6 text-status-info" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Facebook холбох</h3>
            <p className="text-sm text-muted-foreground mb-3">Page-ээ холбож чатбот идэвхжүүлэх</p>
            <span className="text-brand-strong text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
              Тохируулах <ArrowRight className="w-4 h-4" />
            </span>
          </Link>

          <Link
            href="/dashboard/products"
            className="bg-surface rounded-xl p-6 shadow-lg hover:shadow-xl transition-all border border-border/60 group"
          >
            <div className="w-12 h-12 bg-status-success-soft rounded-xl flex items-center justify-center mb-4">
              <Package className="w-6 h-6 text-status-success" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Бүтээгдэхүүн</h3>
            <p className="text-sm text-muted-foreground mb-3">Бүтээгдэхүүн нэмж удирдах</p>
            <span className="text-brand-strong text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
              Бүтээгдэхүүнүүд <ArrowRight className="w-4 h-4" />
            </span>
          </Link>

          <Link
            href="/dashboard"
            className="bg-surface rounded-xl p-6 shadow-lg hover:shadow-xl transition-all border border-border/60 group"
          >
            <div className="w-12 h-12 bg-brand-soft rounded-xl flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-brand-strong" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Dashboard</h3>
            <p className="text-sm text-muted-foreground mb-3">Борлуулалт, захиалга хянах</p>
            <span className="text-brand-strong text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
              Dashboard <ArrowRight className="w-4 h-4" />
            </span>
          </Link>
        </div>
      </div>

      {/* FAQs */}
      <div className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-foreground mb-8 text-center">Түгээмэл асуултууд</h2>
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <details
              key={index}
              className="group bg-surface rounded-xl border border-border overflow-hidden"
            >
              <summary className="px-6 py-4 cursor-pointer flex items-center justify-between hover:bg-surface-2/40">
                <span className="font-medium text-foreground">{faq.question}</span>
                <span className="text-muted-foreground/70 group-open:rotate-180 transition-transform">
                  ▼
                </span>
              </summary>
              <div className="px-6 pb-4 text-muted-foreground">
                {faq.answer}
              </div>
            </details>
          ))}
        </div>
      </div>

      {/* Contact Section */}
      <div className="bg-surface-2 py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-foreground mb-4">Дэмжлэг хэрэгтэй юу?</h2>
          <p className="text-muted-foreground mb-8">Бидэнтэй холбоо барина уу</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="mailto:info@vertmon.mn"
              className="flex items-center gap-2 px-6 py-3 bg-surface rounded-xl shadow hover:shadow-lg transition-all"
            >
              <Mail className="w-5 h-5 text-brand-strong" />
              <span className="font-medium text-foreground">info@vertmon.mn</span>
            </a>
            <a
              href="https://m.me/vertmonhub"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-6 py-3 bg-[#1877F2] text-white rounded-xl shadow hover:shadow-lg transition-all"
            >
              <MessageSquare className="w-5 h-5" />
              <span className="font-medium">Messenger</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>

      {/* Back to Dashboard */}
      <div className="text-center py-8">
        <Link
          href="/dashboard"
          className="text-brand-strong hover:text-brand-strong font-medium"
        >
          ← Dashboard руу буцах
        </Link>
      </div>
    </div>
  );
}

