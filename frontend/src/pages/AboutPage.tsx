import React from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  FileJson,
  Github,
  SearchCheck,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';

const WORKFLOW_STEPS = [
  {
    icon: <FileJson size={20} />,
    title: 'Upload files and metadata',
    desc: 'Submit dataset files and Croissant metadata for the OpenML upload.',
  },
  {
    icon: <ShieldCheck size={20} />,
    title: 'Safety checks run',
    desc: 'The backend verifies uploaded objects and runs the malware scan before review starts.',
  },
  {
    icon: <Github size={20} />,
    title: 'GitHub review issue opens',
    desc: 'When the upload is clean, CDI creates a GitHub issue for available experts and the uploader.',
  },
  {
    icon: <SearchCheck size={20} />,
    title: 'Experts help refine it',
    desc: 'Experts coordinate in GitHub to review formatting, metadata, and requested changes.',
  },
  {
    icon: <CheckCircle2 size={20} />,
    title: 'Approved data moves forward',
    desc: 'Accepted submissions can move toward publication in the OpenML ecosystem.',
  },
];

const ROLES = [
  {
    icon: <FileJson size={22} />,
    title: 'For uploaders',
    desc: 'Get help preparing dataset formatting, Croissant metadata, and review fixes for OpenML.',
  },
  {
    icon: <Users size={22} />,
    title: 'For experts',
    desc: 'Find clean submissions through GitHub review issues and help contributors improve them.',
  },
];

const FEATURES = [
  {
    icon: <Users size={22} />,
    title: 'A meeting point',
    desc: 'CDI connects contributors with experts who want to help improve OpenML datasets.',
  },
  {
    icon: <Github size={22} />,
    title: 'GitHub-based review',
    desc: 'Review discussion happens in GitHub, where uploaders and experts can track decisions.',
  },
  {
    icon: <ClipboardCheck size={22} />,
    title: 'Better OpenML datasets',
    desc: 'The process helps submissions reach OpenML with proper formatting and metadata.',
  },
];

export const AboutPage: React.FC = () => {
  return (
    <div className="container max-w-6xl py-10 fade-in">
      {/* Hero */}
      <div className="mb-8">
        <div>
          <h1 className="heading-1">About OpenML CDI</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Community Data Interface · OpenML</p>
        </div>
      </div>

      {/* Description */}
      <Card className="mb-10 border-primary/35 bg-card/80 shadow-[0_0_32px_oklch(0.45_0.16_152_/_0.12)]">
        <CardContent className="grid gap-5 pt-6 text-muted-foreground leading-relaxed md:grid-cols-[4.5rem_1fr] md:items-center md:p-8">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-primary bg-primary/10 border border-primary/35 shadow-[0_0_24px_oklch(0.45_0.16_152_/_0.18)]">
            <Users size={26} />
          </div>
          <div className="space-y-3">
            <p>
              <strong className="text-foreground">OpenML CDI</strong> connects dataset contributors
              who need help preparing an OpenML upload with experts who can review formatting,
              metadata, and publication readiness.
            </p>
            <p>
              After a dataset upload passes the malware scan, CDI creates a GitHub issue for the
              review. Review communication happens in a GitHub issue so uploaders and available
              experts can work through questions, fixes, and approvals in one shared place.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Workflow */}
      <section className="mb-10">
        <h2 className="heading-2 mb-7">How the workflow works</h2>
        <div className="relative grid grid-cols-1 gap-5 md:grid-cols-5 md:gap-6">
          {WORKFLOW_STEPS.map((step, index) => (
            <div
              key={step.title}
              className="relative flex gap-4 md:flex-col md:items-center md:text-center"
            >
              {index < WORKFLOW_STEPS.length - 1 && (
                <div className="absolute left-[calc(50%+2rem)] right-[calc(-50%+0.5rem)] top-[3.35rem] hidden h-px bg-primary/50 md:block" />
              )}
              <div
                className={`absolute left-6 top-14 bottom-[-1.25rem] w-px bg-primary/25 md:hidden ${
                  index === WORKFLOW_STEPS.length - 1 ? 'hidden' : ''
                }`}
              />
              <div className="relative z-10 flex flex-col items-center gap-3">
                <span className="text-xs font-bold text-primary">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-primary bg-primary/10 border border-primary/35 shadow-[0_0_18px_oklch(0.45_0.16_152_/_0.16)]">
                  <div className="[&_svg]:size-5">{step.icon}</div>
                </div>
              </div>
              <div className="pt-7 md:pt-0">
                <h3 className="font-bold text-foreground leading-snug">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Roles */}
      <section className="mb-10">
        <h2 className="heading-2 mb-4">Who uses CDI?</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {ROLES.map((role) => (
            <Card
              key={role.title}
              className="border-primary/30 bg-card/80 shadow-[0_0_24px_oklch(0.45_0.16_152_/_0.08)]"
            >
              <CardContent className="flex gap-5 p-6">
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-primary bg-primary/10 border border-primary/35 shrink-0">
                  {role.icon}
                </div>
                <div className="self-center">
                  <h3 className="font-bold text-foreground mb-2">{role.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{role.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Feature cards */}
      <h2 className="heading-2 mb-4">Why contribute?</h2>
      <div className="space-y-3">
        {FEATURES.map((f) => (
          <Card
            key={f.title}
            className="border-primary/25 bg-card/80 transition-all duration-200 hover:shadow-[0_0_24px_oklch(0.45_0.16_152_/_0.12)]"
          >
            <CardContent className="grid gap-4 p-5 md:grid-cols-[5rem_1px_1fr] md:items-center md:gap-6">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-primary bg-primary/10 border border-primary/25">
                {f.icon}
              </div>
              <div className="hidden h-12 w-px bg-primary/30 md:block" />
              <div>
                <h3 className="font-bold text-foreground">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
