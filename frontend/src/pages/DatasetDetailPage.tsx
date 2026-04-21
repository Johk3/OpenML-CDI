import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Database,
  FileText,
  Users,
  Calendar,
  Shield,
  MessageSquare,
  Link as LinkIcon,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Dataset } from '../types/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useUserContext } from '@/hooks/useUserContext';

// Mock data fetching function
const fetchDatasetMock = async (id: string): Promise<Dataset> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      // Mock cases
      if (id === 'ds-not-found') {
        reject(new Error('Dataset not found'));
      } else {
        resolve({
          id,
          title: `Madoff Airlines Dataset ${id}`,
          description:
            'A description of the Madoff Airlines Dataset, this dataset was gathered shortly after the events of the great madoff crash of 2008. The data includes information about the plane and the passengers.',
          date: '2026-03-11',
          status: 'finished',
          metrics: { instances: 50000, features: 128 },
          croissantMetadata: {
            title: `Croissant Metadata: ${id}`,
            description:
              'This descriptive section comes directly from the Croissant metadata, providing precise information about the data collection methodology.',
            contributors: ['Aron Madoff', 'Gabe Madoff'],
            license: 'CC-BY-4.0',
            url: 'https://openml.org/d/1234',
            variables: [
              { name: 'age', type: 'integer', description: 'Patient age in years' },
              { name: 'name', type: 'string', description: 'Patient name' },
              {
                name: 'status',
                type: 'categorical',
                description: 'Health status (deceased, alive)',
              },
            ],
          },
          comments: [
            {
              id: 'c-1',
              author: 'Dr. Expert',
              role: 'expert',
              text: 'This dataset look well-structured. I recommend adding a new column for which seat each person was located in.',
              date: '2026-03-10T14:30:00Z',
            },
            {
              id: 'c-2',
              author: 'User Aron',
              role: 'uploader',
              text: 'Thanks for the feedback. I will upload a new version with the seats.',
              date: '2026-03-11T09:15:00Z',
            },
          ],
        });
      }
    }, 800); // simulate network delay
  });
};

export const DatasetDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useUserContext();

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    let isMounted = true;

    const loadDataset = async () => {
      // Defer state updates to avoid synchronous setState warnings
      await Promise.resolve();

      if (!isMounted) return;
      setLoading(true);
      setError(null);

      try {
        const data = await fetchDatasetMock(id);
        if (isMounted) setDataset(data);
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadDataset();

    return () => {
      isMounted = false;
    };
  }, [id]);

  if (!user) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="container py-12">
        <div className="flex flex-col items-center justify-center p-12 bg-card border rounded-2xl shadow-sm">
          <AlertCircle size={48} className="mb-4 text-primary" />
          <h2 className="text-2xl font-bold mb-2">Authentication Required</h2>
          <p className="text-muted-foreground mb-6">Please login to view dataset details.</p>
          <Button onClick={() => navigate('/login')}>Go to Login</Button>
        </div>
      </motion.div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground animate-pulse">Loading dataset details...</p>
      </div>
    );
  }

  if (error || !dataset) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="container py-12"
      >
        <Button variant="ghost" className="mb-6 -ml-4" onClick={() => navigate('/datasets')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Datasets
        </Button>
        <div className="flex flex-col items-center justify-center p-12 bg-destructive/5 border border-destructive/20 rounded-2xl">
          <AlertCircle size={48} className="mb-4 text-destructive" />
          <h2 className="text-2xl font-bold mb-2">Error Loading Dataset</h2>
          <p className="text-muted-foreground">{error || 'Dataset not found.'}</p>
        </div>
      </motion.div>
    );
  }

  const { croissantMetadata, comments } = dataset;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="container py-8 max-w-5xl"
    >
      <Button
        variant="ghost"
        className="mb-6 -ml-4 text-muted-foreground hover:text-foreground"
        onClick={() => navigate('/datasets')}
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Datasets
      </Button>

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Database size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{dataset.title}</h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                <span className="flex items-center gap-1">
                  <Calendar size={14} /> {dataset.date}
                </span>
                {dataset.metrics && (
                  <>
                    <span className="flex items-center gap-1">
                      <FileText size={14} /> {dataset.metrics.instances.toLocaleString()} rows
                    </span>
                    <span className="flex items-center gap-1">
                      <Database size={14} /> {dataset.metrics.features} features
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 shrink-0">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-primary/10 text-primary border border-primary/20">
            {dataset.status.charAt(0).toUpperCase() + dataset.status.slice(1)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Column */}
        <div className="lg:col-span-2 space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3 border-b pb-2">Description</h2>
            <p className="text-muted-foreground leading-relaxed">{dataset.description}</p>
          </section>

          {croissantMetadata && (
            <motion.section
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <h2 className="text-xl font-semibold mb-4 border-b pb-2 flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" /> Croissant Metadata
              </h2>

              <div className="space-y-6">
                <div>
                  <h3 className="font-medium text-foreground mb-1">Croissant Title</h3>
                  <p className="text-sm text-muted-foreground">{croissantMetadata.title}</p>
                </div>

                <div>
                  <h3 className="font-medium text-foreground mb-1">Croissant Description</h3>
                  <p className="text-sm text-muted-foreground">{croissantMetadata.description}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-muted/30 p-4 rounded-lg border">
                    <h3 className="font-medium flex items-center gap-2 mb-2 text-sm">
                      <Users className="w-4 h-4 text-muted-foreground" /> Contributors
                    </h3>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {croissantMetadata.contributors.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-muted/30 p-4 rounded-lg border">
                    <h3 className="font-medium flex items-center gap-2 mb-2 text-sm">
                      <Shield className="w-4 h-4 text-muted-foreground" /> License & Info
                    </h3>
                    <div className="text-sm text-muted-foreground space-y-2">
                      <p>
                        <span className="font-medium text-foreground">License:</span>{' '}
                        {croissantMetadata.license}
                      </p>
                      {croissantMetadata.url && (
                        <p className="flex items-center gap-1">
                          <span className="font-medium text-foreground">URL:</span>
                          <a
                            href={croissantMetadata.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline flex items-center gap-1"
                          >
                            Link <LinkIcon size={12} />
                          </a>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {croissantMetadata.variables && croissantMetadata.variables.length > 0 && (
                  <div>
                    <h3 className="font-medium text-foreground mb-3 text-sm flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" /> Variables (
                      {croissantMetadata.variables.length})
                    </h3>
                    <div className="border rounded-xl overflow-hidden">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-muted/50 text-muted-foreground">
                          <tr>
                            <th className="px-4 py-3 font-medium">Name</th>
                            <th className="px-4 py-3 font-medium">Type</th>
                            <th className="px-4 py-3 font-medium">Description</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {croissantMetadata.variables.map((v, i) => (
                            <tr key={i} className="bg-card hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-3 font-medium">{v.name}</td>
                              <td className="px-4 py-3">
                                <span className="inline-flex px-2 py-0.5 rounded text-xs bg-secondary text-secondary-foreground">
                                  {v.type}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {v.description || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </motion.section>
          )}
        </div>

        {/* Sidebar Column */}
        <div className="space-y-6">
          <Card className="border-primary/10 shadow-sm">
            <CardHeader className="pb-3 border-b bg-muted/20">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Discussions
              </CardTitle>
              <CardDescription>Comments and notes from users and experts</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {comments && comments.length > 0 ? (
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <div key={comment.id} className="flex gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          comment.role === 'expert'
                            ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30'
                        }`}
                      >
                        {comment.author.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 bg-muted/40 rounded-lg p-3 text-sm">
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <span className="font-semibold text-foreground">{comment.author}</span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(comment.date).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-muted-foreground leading-relaxed">{comment.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p>No comments yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
};
