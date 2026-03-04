import React from 'react';

export const AboutPage: React.FC = () => {
    return (
        <div className="container" style={{ padding: '2rem 0' }}>
            <h1 style={{ fontSize: '2rem', marginBottom: '1.5rem', color: 'var(--text-primary)' }}>
                About OpenML CDI
            </h1>
            <div className="card" style={{ padding: '2rem' }}>
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>
                    OpenML CDI (Customer Data Interface) is a platform for uploading machine learning datasets.
                </p>
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    This interface provides an intuitive way to upload datasets and ensure data quality before publishing them to OpenML.
                </p>
            </div>
        </div>
    );
};
