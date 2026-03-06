import React, { useState } from 'react';
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
import { useAuth } from '../context/useAuth';
import { Dataset, DatasetStatus } from '../types/auth';
import '../styles/datasets.css';

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

// Helper to render the correct icon and text for a status
const StatusIndicator = ({ status }: { status: DatasetStatus }) => {
  switch (status) {
    case 'ready':
      return (
        <span className="dataset-status status-ready">
          <Clock size={16} className="status-icon" />
          <span>Ready for Processing</span>
        </span>
      );
    case 'processing':
      return (
        <span className="dataset-status status-processing">
          <Loader2 size={16} className="status-icon" />
          <span>Processing...</span>
        </span>
      );
    case 'finished':
      return (
        <span className="dataset-status status-finished">
          <CheckCircle2 size={16} className="status-icon" />
          <span>Verified & Published</span>
        </span>
      );
    case 'error':
      return (
        <span className="dataset-status status-error">
          <AlertCircle size={16} className="status-icon" />
          <span>Processing Error</span>
        </span>
      );
    default:
      return null;
  }
};

export const MyDatasetsPage: React.FC = () => {
  const { user } = useAuth();
  // Using local state so Experts can mock-edit the statuses
  const [datasets, setDatasets] = useState<Dataset[]>(MOCK_DATASETS);

  // If the user is unauthenticated somehow, don't show the datasets
  if (!user) {
    return (
      <div className="datasets-page fade-in">
        <div className="container">
          <div className="datasets-empty">
            <AlertCircle size={48} className="mb-4" style={{ color: 'var(--accent-primary)' }} />
            <h2 className="heading-2">Authentication Required</h2>
            <p className="subheading text-center">Please login to view datasets.</p>
          </div>
        </div>
      </div>
    );
  }

  const isExpert = user.role === 'expert';

  // Mock handler for status changes
  const handleStatusChange = (id: string, newStatus: DatasetStatus) => {
    setDatasets((current) =>
      current.map((ds) => (ds.id === id ? { ...ds, status: newStatus } : ds)),
    );
  };

  return (
    <div className="datasets-page fade-in">
      <div className="container">
        <div className="datasets-header">
          <h1 className="heading-1">{isExpert ? 'All User Datasets' : 'My Datasets'}</h1>
          <p className="subheading">
            {isExpert
              ? 'Expert View: Review global uploads, change processing states, and download files.'
              : 'View and manage the datasets you have uploaded. Track their processing status here.'}
          </p>
        </div>

        {datasets.length === 0 ? (
          <div className="datasets-empty">
            <div className="empty-icon">
              <Database size={32} />
            </div>
            <h2 className="empty-title">No datasets found</h2>
            <p className="empty-description">
              {isExpert
                ? 'No users have uploaded datasets yet.'
                : "You haven't uploaded any datasets yet. Head over to the Upload page to contribute."}
            </p>
          </div>
        ) : (
          <div className="datasets-grid">
            {datasets.map((dataset) => (
              <div key={dataset.id} className="dataset-card">
                <div className="dataset-card-header">
                  <div className="dataset-icon">
                    <Database size={20} />
                  </div>
                  <div
                    style={{
                      textAlign: 'right',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: '0.5rem',
                    }}
                  >
                    <div className="dataset-date">
                      <Calendar
                        size={12}
                        className="inline mr-1"
                        style={{
                          display: 'inline',
                          marginRight: '4px',
                          verticalAlign: 'middle',
                        }}
                      />
                      {dataset.date}
                    </div>
                    {isExpert && (
                      <button
                        className="btn"
                        style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          backgroundColor: 'var(--bg-tertiary)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          alert(`Mock downloading dataset: ${dataset.title}`);
                        }}
                      >
                        <Download size={12} /> Download
                      </button>
                    )}
                  </div>
                </div>

                <h3 className="dataset-title">{dataset.title}</h3>
                <p className="dataset-description">{dataset.description}</p>

                {dataset.metrics && (
                  <div
                    style={{
                      display: 'flex',
                      gap: '1rem',
                      marginBottom: '1.5rem',
                      fontSize: '0.85rem',
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <FileText size={14} /> {dataset.metrics.instances.toLocaleString()} rows
                    </span>
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <Database size={14} /> {dataset.metrics.features} cols
                    </span>
                  </div>
                )}

                <div
                  style={{
                    marginTop: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                  }}
                >
                  <StatusIndicator status={dataset.status} />

                  {isExpert && (
                    <select
                      value={dataset.status}
                      onChange={(e) =>
                        handleStatusChange(dataset.id, e.target.value as DatasetStatus)
                      }
                      className="status-dropdown"
                      style={{
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.85rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-focus)',
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        outline: 'none',
                      }}
                    >
                      <option value="ready">Ready for Processing</option>
                      <option value="processing">Processing...</option>
                      <option value="finished">Verified & Published</option>
                      <option value="error">Processing Error</option>
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
