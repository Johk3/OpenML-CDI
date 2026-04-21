import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Clock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Database,
  FileText,
  Calendar,
  Download,
} from 'lucide-react';
import { Dataset, DatasetStatus } from '../types/auth';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { useUserContext } from '@/hooks/useUserContext';

// Mock data to demonstrate different states
// This data is NOT real or relevant to the project and is only for demonstration purposes
const MOCK_DATASETS: Dataset[] = [
  {
    id: 'ds-1',
    title: 'CTF Team Airon Prediction',
    description: 'A dataset containing the results of the CTF Team Airon competition.',
    date: '2026-02-23',
    status: 'processing',
    metrics: { instances: 10450, features: 21 },
  },
  {
    id: 'ds-2',
    title: 'CTF Team AirJoe Prediction',
    description: 'A dataset containing the results of the CTF Team AirJoe competition.',
    date: '2026-02-21',
    status: 'finished',
    metrics: { instances: 1716, features: 5 },
  },
  {
    id: 'ds-3',
    title: 'Madoff Airline Crash Data',
    description: 'A dataset containing all of the plane crash data from 1918 to 2026.',
    date: '2026-02-18',
    status: 'ready',
  },
  {
    id: 'ds-4',
    title: 'Madoff Airline Success Data',
    description: 'A dataset containing all of the successful plane landings from 1918 to 2026.',
    date: '2026-02-15',
    status: 'error',
  },
];

const STATUS_CONFIG: Record<DatasetStatus, { label: string; icon: React.ReactNode; cls: string }> =
  {
    ready: {
      label: 'Ready for Processing',
      icon: <Clock size={13} />,
      cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700',
    },
    processing: {
      label: 'Processing…',
      icon: <Loader2 size={13} className="animate-spin" />,
      cls: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800',
    },
    finished: {
      label: 'Verified & Published',
      icon: <CheckCircle2 size={13} />,
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    },
    error: {
      label: 'Processing Error',
      icon: <AlertCircle size={13} />,
      cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
    },
  };

const StatusBadge = ({ status }: { status: DatasetStatus }) => {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.cls}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
};

export const MyDatasetsPage: React.FC = () => {
  const { user } = useUserContext();
  const [datasets, setDatasets] = useState<Dataset[]>(MOCK_DATASETS);

  if (!user) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="datasets-page"
      >
        <div className="container">
          <div className="datasets-empty">
            <AlertCircle size={48} className="mb-4 text-primary" />
            <h2 className="heading-2">Authentication Required</h2>
            <p className="subheading text-center">Please login to view datasets.</p>
          </div>
        </div>
      </motion.div>
    );
  }

  const isExpert = user.role === 'expert';
  const handleStatusChange = (id: string, newStatus: DatasetStatus) =>
    setDatasets((cur) => cur.map((ds) => (ds.id === id ? { ...ds, status: newStatus } : ds)));

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="datasets-page"
    >
      <div className="container">
        {/* Header */}
        <div className="datasets-header">
          <div className="flex items-center gap-3 mb-1">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white"
              style={{ background: 'var(--accent-gradient)' }}
            >
              <Database size={18} />
            </div>
            <h1 className="heading-1">{isExpert ? 'All User Datasets' : 'My Datasets'}</h1>
          </div>
          <p className="subheading" style={{ maxWidth: '600px' }}>
            {isExpert
              ? 'Expert View: Review global uploads, change processing states, and download files.'
              : 'View and manage the datasets you have uploaded. Track their processing status here.'}
          </p>
          {isExpert && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800">
              <CheckCircle2 size={12} /> Expert mode active
            </div>
          )}
        </div>

        {datasets.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="datasets-empty">
            <div className="empty-icon">
              <Database size={32} />
            </div>
            <h2 className="empty-title">No datasets found</h2>
            <p className="empty-description">
              {isExpert
                ? 'No users have uploaded datasets yet.'
                : "You haven't uploaded any datasets yet."}
            </p>
          </motion.div>
        ) : (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.05 } },
            }}
            className="datasets-grid"
          >
            {datasets.map((dataset) => (
              <motion.div
                key={dataset.id}
                variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
              >
                <Link to={`/datasets/${dataset.id}`} className="block h-full">
                  <Card className="flex flex-col h-full group transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 border-border/70">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-primary bg-primary/10 group-hover:bg-primary/15 transition-colors shrink-0">
                          <Database size={19} />
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="dataset-date flex items-center gap-1">
                            <Calendar size={11} />
                            {dataset.date}
                          </span>
                          {isExpert && (
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={(e) => {
                                e.preventDefault();
                                alert(`Mock downloading: ${dataset.title}`);
                              }}
                            >
                              <Download size={12} /> Download
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="flex flex-col flex-1 gap-2">
                      <h3 className="dataset-title">{dataset.title}</h3>
                      <p className="dataset-description">{dataset.description}</p>

                      {dataset.metrics && (
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <FileText size={12} />
                            {dataset.metrics.instances.toLocaleString()} rows
                          </span>
                          <span className="flex items-center gap-1">
                            <Database size={12} />
                            {dataset.metrics.features} cols
                          </span>
                        </div>
                      )}

                      <div className="mt-auto pt-3 border-t border-border/50 flex items-center justify-between gap-3">
                        <StatusBadge status={dataset.status} />
                        {isExpert && (
                          <Select
                            value={dataset.status}
                            onValueChange={(val) =>
                              handleStatusChange(dataset.id, val as DatasetStatus)
                            }
                          >
                            <SelectTrigger
                              className="h-7 text-xs w-auto max-w-[160px]"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ready">Ready for Processing</SelectItem>
                              <SelectItem value="processing">Processing…</SelectItem>
                              <SelectItem value="finished">Verified &amp; Published</SelectItem>
                              <SelectItem value="error">Processing Error</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};
