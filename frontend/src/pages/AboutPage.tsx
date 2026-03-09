import React from 'react';
import { Database, Globe, Zap, Shield } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';

const FEATURES = [
  {
    icon: <Globe size={22} />,
    title: 'Open Science',
    desc: 'All datasets are publicly available to researchers worldwide.',
  },
  {
    icon: <Shield size={22} />,
    title: 'Quality Assured',
    desc: 'Every submission is reviewed by our experts before being published to the OpenML platform.',
  },
  {
    icon: <Zap size={22} />,
    title: 'ML-Ready',
    desc: 'Datasets are standardised and enriched with Croissant metadata making them ready for machine learning workflows.',
  },
];

export const AboutPage: React.FC = () => {
  return (
    <div className="container py-10 fade-in">
      {/* Hero */}
      <div className="flex items-center gap-4 mb-8">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0"
          style={{ background: 'var(--accent-gradient)', boxShadow: 'var(--shadow-glow)' }}
        >
          <Database size={22} />
        </div>
        <div>
          <h1 className="heading-1">About OpenML CDI</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Customer Data Interface · OpenML</p>
        </div>
      </div>

      {/* Description */}
      <Card className="mb-8 border-border/70">
        <CardContent className="pt-6 text-muted-foreground leading-relaxed space-y-3">
          <p>
            <strong className="text-foreground">OpenML CDI</strong> (Customer Data Interface) is a
            dedicated portal for contributing machine learning datasets to the OpenML ecosystem.
          </p>
          <p>
            This interface provides an intuitive pipeline to upload, validate, and publish datasets,
            ensuring dataset quality before they reach the broader research community.
          </p>
        </CardContent>
      </Card>

      {/* Feature cards */}
      <h2 className="heading-2 mb-4">Why contribute?</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {FEATURES.map((f) => (
          <Card
            key={f.title}
            className="border-border/60 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
          >
            <CardContent className="pt-6 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-primary bg-primary/10">
                {f.icon}
              </div>
              <h3 className="font-bold text-foreground">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
