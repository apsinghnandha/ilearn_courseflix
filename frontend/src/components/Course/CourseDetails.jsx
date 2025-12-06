import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import { Container, Grid, Group, Text, Title } from '@mantine/core';
import { PlayerPlay } from 'tabler-icons-react';
import { formatSectionName, formatTitle, formatDuration } from '../../utils/formatting';
import CourseHero from '../Hero/CourseHero';
import CoursePlayer from '../Player/CoursePlayer';

export default function CourseDetails({ courseId: propId, onClose, onPlay }) {
    const { id: paramId } = useParams();
    const id = propId || paramId;
    const navigate = useNavigate();
    const location = useLocation();
    const [course, setCourse] = useState(null);
    const [allCourses, setAllCourses] = useState([]);
    const isMobile = useMediaQuery('(max-width: 768px)');
    const [playingVideoId, setPlayingVideoId] = useState(null);

    useEffect(() => {
        fetch(`/api/course/${id}`).then(r => r.json()).then(setCourse);
        fetch('/api/settings/courses').then(r => r.json()).then(setAllCourses);
    }, [id]);

    const sections = useMemo(() => {
        if (!course || !course.videos) return [];
        const groups = [];
        let currentGroup = null;
        
        (course.videos || []).forEach(v => {
            if (!v || !v.filename) return;
            const parts = v.filename.split('/');
            let folderName = "Episodes";
            if (parts.length > 1) {
                folderName = parts.slice(0, -1).join('/');
            }
            
            if (!currentGroup || currentGroup.name !== folderName) {
                currentGroup = { name: folderName, videos: [] };
                groups.push(currentGroup);
            }
            currentGroup.videos.push(v);
        });
        return groups;
    }, [course]);

    useEffect(() => {
        if (location.state?.lastVideoId && sections.length > 0) {
            setTimeout(() => {
                const element = document.getElementById(`video-${location.state.lastVideoId}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'auto', block: 'center' });
                }
            }, 100);
        }
    }, [location.state, sections]);

    if (!course) return null;

    // Find duplicates to get all sub-categories
    const relatedCourses = allCourses.filter(c => 
        c.title === course.title && c.instructor === course.instructor
    );
    const allSubCategories = [...new Set(relatedCourses.map(c => c.sub_category).filter(Boolean))];
    const displaySubCategories = allSubCategories.length > 0 ? allSubCategories.join(", ") : course.sub_category;

    const handlePlay = (videoId) => {
        if (onClose) {
            navigate(`/watch/${course.id}/${videoId}`, { state: { returnTo: location.pathname, returnToModal: course.id } });
            onClose();
        } else {
            setPlayingVideoId(videoId);
        }
    };

    // Use top-level formatSectionName helper

    return (
        <div style={{ background: '#141414', minHeight: '100vh', color: 'white' }}>
            {/* Hero Section (uses CourseHero) */}
            <CourseHero 
                course={course} 
                navigate={(path) => {
                    // Intercept navigation to watch page
                    if (path.startsWith('/watch/')) {
                        const parts = path.split('/');
                        const vidId = parts[parts.length - 1];
                        if (vidId === 'first') {
                            const target = course.videos.find(v => v.is_downloaded) || course.videos[0];
                            if (target) handlePlay(target.id);
                        } else {
                            handlePlay(parseInt(vidId));
                        }
                    } else {
                        navigate(path);
                    }
                }} 
                isMobile={isMobile} 
            />

            {/* Info Section */}
            <Container size="xl" px={isMobile ? '1rem' : '4rem'} py="xl">
                <Grid gutter="xl">
                    <Grid.Col span={isMobile ? 12 : 8}>
                        <Group mb="sm" gap="sm">
                            {course.year && <Text fw={700} c="gray.5">{course.year}</Text>}
                            <Text c="gray.5">{(course.videos || []).length} Episodes</Text>
                            <span style={{ border: '1px solid gray', padding: '0 4px', fontSize: '0.8em', borderRadius: '3px', color: 'gray' }}>HD</span>
                        </Group>
                        <Text size="lg" style={{ lineHeight: 1.5 }}>
                            {course.carousel_info || course.description}
                        </Text>
                    </Grid.Col>
                    <Grid.Col span={isMobile ? 12 : 4}>
                        <div style={{ fontSize: '14px', lineHeight: '20px' }}>
                            <div style={{ marginBottom: '10px' }}>
                                <span style={{ color: '#777' }}>Cast: </span>
                                <span style={{ color: 'white' }}>{course.instructor}</span>
                            </div>
                            <div style={{ marginBottom: '10px' }}>
                                <span style={{ color: '#777' }}>Teaches: </span>
                                <span style={{ color: 'white' }}>{displaySubCategories}</span>
                            </div>
                            <div style={{ marginBottom: '10px' }}>
                                <span style={{ color: '#777' }}>Genres: </span>
                                <span style={{ color: 'white' }}>{course.category}</span>
                            </div>
                        </div>
                    </Grid.Col>
                </Grid>
            </Container>

            {/* Episodes List */}
            <Container size="xl" py="xl" px={isMobile ? '1rem' : '4rem'}>
                <Title order={3} mb="lg">Episodes</Title>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {sections.map((section, idx) => (
                        <div key={`${section.name}-${idx}`}>
                            {(sections.length > 1 || section.name !== "Episodes") && (
                                <Title order={4} mb="md" c="gray.3" style={{ borderBottom: '1px solid #333', paddingBottom: '8px' }}>
                                    {formatSectionName(section.name)}
                                </Title>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {section.videos.map((v, localIdx) => {
                                    if (!v || !v.filename) return null;
                                    return (
                                        <div 
                                            key={v.id} 
                                            id={`video-${v.id}`}
                                            onClick={() => handlePlay(v.id)}
                                            style={{ 
                                                display: 'flex', 
                                                gap: '1rem', 
                                                padding: '1rem', 
                                                borderRadius: '4px', 
                                                cursor: 'pointer',
                                                borderBottom: '1px solid #333',
                                                transition: 'background 0.2s',
                                                flexDirection: isMobile ? 'column' : 'row'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#333'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                            {!isMobile && (
                                                <div style={{ fontSize: '1.5rem', color: 'gray', width: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {localIdx + 1}
                                                </div>
                                            )}
                                            <div style={{ 
                                                width: isMobile ? '100%' : '160px', 
                                                aspectRatio: '16/9', 
                                                background: '#25262b', 
                                                borderRadius: '4px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                position: 'relative',
                                                overflow: 'hidden'
                                            }}>
                                                <img 
                                                    src={v.frame} 
                                                    alt="" 
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }}
                                                    onError={(e) => { e.target.style.display = 'none'; }}
                                                />
                                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <PlayerPlay size={30} color="white" style={{ opacity: 0.9, filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.5))' }} />
                                                </div>
                                            </div>
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                                <Group justify="space-between">
                                                    <Text size="lg" fw={700} c="white">{formatTitle(v.filename.split('/').pop())}</Text>
                                                    <Text c="gray.5">{formatDuration(v.duration)}</Text>
                                                </Group>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </Container>

            {/* Full Screen Player Overlay */}
            {playingVideoId && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: 'black' }}>
                    <CoursePlayer 
                        course={course} 
                        initialVideoId={playingVideoId} 
                        onClose={() => setPlayingVideoId(null)} 
                    />
                </div>
            )}
        </div>
    );
}
