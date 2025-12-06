/*
 * frontend/src/App.jsx
 * -----------------------------------------------------------------------------
 * Main Application Component
 * -----------------------------------------------------------------------------
 * This component serves as the root layout and routing manager for the React application.
 * It handles the global state, navigation, and the main UI shell.
 *
 * Key Features:
 * 1.  **Routing**: Uses `react-router-dom` to manage navigation between:
 *     -   Library (Home): `/`
 *     -   Search: `/search`
 *     -   Course Details: `/course/:id`
 *     -   Video Player: `/watch/:courseId/:videoId`
 *     -   Settings: `/settings`
 * 2.  **Global Layout**: Renders the `AppShell` from Mantine, including the custom
 *     transparent/gradient navbar that adapts based on the current route.
 * 3.  **Modal Management**: Handles the course details modal for desktop users,
 *     allowing quick previews without leaving the current context.
 * 4.  **Video Cleanup**: Automatically cleans up video elements when navigating away
 *     from the player to prevent memory leaks and background audio.
 * 5.  **Responsive Design**: Adapts behavior (modals vs navigation) based on screen size.
 */
import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { AppShell, Group, Title, Text, Modal, ActionIcon, Menu } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Search, Settings, X } from 'tabler-icons-react';

import Library from './pages/Library';
import { SettingsPage } from './pages/SettingsPage';
import SearchPage from './pages/SearchPage';
import CourseDetails from './components/Course/CourseDetails';
import CoursePlayer from './components/Player/CoursePlayer';

function App() {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const isPlayer = location.pathname.startsWith('/watch');
    const isMobile = useMediaQuery('(max-width: 768px)');
    const [modalCourseId, setModalCourseId] = useState(null);
    const [playingContext, setPlayingContext] = useState(null);

    useEffect(() => {
        if (location.state?.openModalCourseId) {
            setModalCourseId(location.state.openModalCourseId);
        }
    }, [location.state]);

    const handleCourseClick = (id) => {
        if (!isMobile) {
            setModalCourseId(id);
        } else {
            navigate(`/course/${id}`);
        }
    };

    const [navbarConfig, setNavbarConfig] = useState([]);
    useEffect(() => {
        fetch('/api/settings/navbar').then(r => r.json()).then(data => {
            if (Array.isArray(data)) setNavbarConfig(data);
            else setNavbarConfig(Object.entries(data).map(([k, v]) => ({ name: k, categories: v })));
        });
    }, []);

    // Global cleanup: stop all video streams on navigation
    useEffect(() => {
        if (!location.pathname.startsWith('/watch')) {
            // Force cleanup of any lingering video elements
            const videos = document.querySelectorAll('video');
            videos.forEach(video => {
                video.pause();
                video.removeAttribute('src');
                video.load();
            });
        }
    }, [location.pathname]);

    return (
        <AppShell header={{ height: 0 }} padding="0">
            {!isPlayer && (
                <div style={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    right: 0, 
                    zIndex: 100,
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)',
                    height: '68px',
                    paddingTop: '8px',
                    pointerEvents: 'none',
                    transition: 'background-color 0.4s'
                }}>
                    <Group h="100%" px={isMobile ? '1rem' : '4rem'} justify="space-between" style={{ pointerEvents: 'auto' }}>
                        <Group>
                            <Title order={3} onClick={() => {
                                const group = searchParams.get('group');
                                const lastGroup = localStorage.getItem('lastGroup');
                                const targetGroup = group || lastGroup;

                                if (targetGroup) {
                                    const targetPath = `/?group=${encodeURIComponent(targetGroup)}`;
                                    if (location.pathname === '/' && searchParams.get('group') === targetGroup) {
                                        window.location.reload();
                                    } else {
                                        navigate(targetPath);
                                    }
                                } else {
                                    if (location.pathname === '/' && !searchParams.get('group')) {
                                        window.location.reload();
                                    } else {
                                        navigate('/');
                                    }
                                }
                            }} style={{
                                cursor: 'pointer', 
                                color: '#E50914', 
                                fontFamily: '"Netflix Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
                                fontWeight: 900, 
                                fontSize: '2.5rem',
                                letterSpacing: '1px',
                                textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                            }}>iLearn</Title>
                            <Menu trigger="hover" openDelay={100} closeDelay={400}>
                                <Menu.Target>
                                    <Text c="white" style={{ cursor: 'pointer', fontWeight: 700 }} ml="md">Browse</Text>
                                </Menu.Target>
                                <Menu.Dropdown style={{ background: 'rgba(0,0,0,0.9)', border: '1px solid #333' }}>
                                    {navbarConfig.map(group => (
                                        <Menu.Item 
                                            key={group.name} 
                                            onClick={() => navigate(`/?group=${encodeURIComponent(group.name)}`)}
                                            style={{ color: 'white' }}
                                        >
                                            {group.name}
                                        </Menu.Item>
                                    ))}
                                </Menu.Dropdown>
                            </Menu>
                        </Group>
                        <Group gap="xl">
                            <Search size={24} color="white" style={{cursor: 'pointer'}} onClick={() => navigate('/search')} />
                            <Settings size={24} color="white" style={{cursor: 'pointer'}} onClick={() => navigate('/settings')} />
                        </Group>
                    </Group>
                </div>
            )}
            <AppShell.Main style={{ background: '#141414', paddingTop: location.pathname === '/settings' ? '100px' : 0 }}>
                <Modal 
                    opened={!!modalCourseId} 
                    onClose={() => setModalCourseId(null)} 
                    size="70%"
                    padding={0}
                    withCloseButton={false}
                    yOffset={0}
                    styles={{ 
                        content: { 
                            background: '#141414', 
                            overflow: 'hidden', 
                            height: 'calc(100vh - 40px)', 
                            marginTop: '40px',
                            marginBottom: 0,
                            borderRadius: '16px 16px 0 0',
                            boxShadow: '0 -20px 50px rgba(0,0,0,0.8)',
                            maxWidth: '900px',
                        },
                        body: { padding: 0, height: '100%' },
                        inner: { padding: 0 }
                    }}
                    overlayProps={{
                        backgroundOpacity: 0.8,
                        blur: 0,
                    }}
                >
                    {modalCourseId && (
                        <div style={{ height: '100%', overflowY: 'auto', position: 'relative' }}>
                            <CourseDetails 
                                courseId={modalCourseId} 
                                onClose={() => setModalCourseId(null)} 
                            />
                            <ActionIcon 
                                variant="filled" 
                                color="dark" 
                                size="lg" 
                                radius="xl"
                                style={{ position: 'absolute', top: 20, right: 20, zIndex: 1000 }}
                                onClick={() => setModalCourseId(null)}
                            >
                                <X size={20} />
                            </ActionIcon>
                        </div>
                    )}
                </Modal>
                {playingContext && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000, background: 'black' }}>
                        <CoursePlayer 
                            course={playingContext.course} 
                            initialVideoId={playingContext.videoId} 
                            onClose={() => setPlayingContext(null)} 
                        />
                    </div>
                )}
                <Routes>
                    <Route path="/" element={<Library onCourseClick={handleCourseClick} />} />
                    <Route path="/search" element={<SearchPage onCourseClick={handleCourseClick} />} />
                    <Route path="/course/:id" element={<CourseDetails />} />
                    <Route path="/watch/:courseId/:videoId" element={<CoursePlayer />} />
                    <Route path="/settings" element={<SettingsPage />} />
                </Routes>
            </AppShell.Main>
        </AppShell>
    );
}

export default function Main() { return <BrowserRouter><App /></BrowserRouter> }
