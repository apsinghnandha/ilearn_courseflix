import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container, TextInput, Text, Title } from '@mantine/core';
import { Search, X } from 'tabler-icons-react';

export default function SearchPage({ onCourseClick }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [allCourses, setAllCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const q = searchParams.get('q');
    const inputRef = useRef(null);

    useEffect(() => {
        fetch('/api/settings/courses').then(r => r.json()).then(data => {
            setAllCourses(data);
            setLoading(false);
        });
    }, []);

    useEffect(() => {
        if (q) {
            setQuery(q);
        }
    }, [q]);

    useEffect(() => {
        if (!query) {
            setResults([]);
            return;
        }
        const lower = query.toLowerCase();
        const filtered = allCourses.filter(c => 
            c.title.toLowerCase().includes(lower) || 
            (c.instructor && c.instructor.toLowerCase().includes(lower))
        );
        setResults(filtered);
    }, [query, allCourses]);

    const handleSearch = (val) => {
        setQuery(val);
        setSearchParams({ q: val });
    };

    return (
        <div style={{ minHeight: '100vh', paddingTop: '100px' }} onClick={() => navigate('/')}>
            <div 
                style={{ 
                    position: 'fixed', 
                    top: '12px', 
                    right: '4rem', 
                    zIndex: 1000, 
                    width: '300px' 
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <TextInput 
                    ref={inputRef}
                    placeholder="Search..." 
                    size="md" 
                    value={query} 
                    onChange={(e) => handleSearch(e.currentTarget.value)}
                    leftSection={<Search size={16} />}
                    rightSection={
                        <X size={16} style={{ cursor: 'pointer' }} onClick={() => { 
                            setQuery(''); 
                            setSearchParams({ q: '' }); 
                            inputRef.current?.focus();
                        }} />
                    }
                    autoFocus
                    styles={{ 
                        input: { 
                            background: '#000', 
                            color: 'white', 
                            border: '1px solid #333',
                            fontSize: '1rem',
                            height: '40px'
                        } 
                    }}
                />
            </div>
            
            <Container size="xl">
                {loading ? <Text c="white">Loading...</Text> : (
                    <>
                        {results.length > 0 && (
                            <Title order={3} c="white" mb="lg">
                                {results.length} Results
                            </Title>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
                            {results.map(c => (
                                <div 
                                    key={c.id} 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        if (onCourseClick) onCourseClick(c.id);
                                        else navigate(`/course/${c.id}`); 
                                    }} 
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div style={{ aspectRatio: '16/9', marginBottom: '10px', background: '#25262b', borderRadius: '4px', overflow: 'hidden' }}>
                                        <img 
                                            src={c.cover_path ? `/api/cover/${c.id}` : ''} 
                                            alt={c.title}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            onError={(e) => e.target.style.display = 'none'}
                                        />
                                    </div>
                                    <Text c="white" fw={700} lineClamp={1}>{c.title}</Text>
                                    <Text c="dimmed" size="sm">{c.instructor}</Text>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </Container>
        </div>
    );
}
