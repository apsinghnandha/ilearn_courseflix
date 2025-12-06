import React, { useMemo } from 'react';
import { Container, Group, Button } from '@mantine/core';
import { PlayerPlay } from 'tabler-icons-react';
import { getSvgDesign, HERO_START_SCALE } from '../../utils/design';

export default function CourseHero({ course, navigate, isMobile }) {
    const design = useMemo(() => getSvgDesign(course.title), [course.title]);

    const renderSvgTitle = () => {
        const words = course.title.split(' ');
        let lines = [];
        let currentLine = words[0];
        for (let i = 1; i < words.length; i++) {
            if (currentLine.length + 1 + words[i].length < 15) {
                currentLine += ' ' + words[i];
            } else {
                lines.push(currentLine);
                currentLine = words[i];
            }
        }
        lines.push(currentLine);
        if (lines.length > 2) lines = [lines[0], lines.slice(1).join(' ')]; // Max 2 lines

        return (
            <svg width="100%" viewBox={`0 0 800 ${lines.length * 100}`} style={{ overflow: 'visible', maxWidth: '100%', height: 'auto' }}>
                {lines.map((line, i) => (
                    <text key={i} x="0" y={90 + (i * 100)}
                        fontFamily={design.fontFamily}
                        fontSize="93"
                        fill={design.fill}
                        stroke={design.stroke}
                        strokeWidth={design.strokeWidth}
                        filter={design.filter}
                        fontWeight="900"
                        style={{ textTransform: 'uppercase', letterSpacing: '-2px' }}
                    >
                        {line}
                    </text>
                ))}
            </svg>
        );
    };

    return (
        <div style={{
            height: isMobile ? '70vh' : '42vw',
            width: '100%',
            position: 'relative',
            backgroundImage: `url("${course.cover_path}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center center',
            display: 'flex',
            alignItems: 'flex-end'
        }}>
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: 'linear-gradient(to right, rgba(0,0,0,0.6) 0%, transparent 50%)'
            }} />
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: 'linear-gradient(to top, #141414 0%, transparent 40%)'
            }} />
            
            <Container fluid size="xl" px={isMobile ? '1rem' : '3rem'} style={{ 
                position: 'relative', 
                zIndex: 10, 
                width: '100%', 
                paddingBottom: isMobile ? '20%' : '6%'
            }}>
                <div style={{ 
                    transform: `scale(${HERO_START_SCALE})`,
                    transformOrigin: 'bottom left',
                    marginBottom: '0.5rem',
                    maxWidth: isMobile ? '100%' : '60%',
                    zIndex: 12
                }}>
                    {renderSvgTitle()}
                </div>
                
                <Group style={{ transform: `scale(${HERO_START_SCALE})`, transformOrigin: 'left bottom', zIndex: 11 }}>
                    <Button 
                        size={isMobile ? 'md' : 'lg'} 
                        color="white" 
                        c="black" 
                        leftSection={<PlayerPlay size={32} fill="black" />}
                        onClick={() => {
                            const lastWatched = course.videos.filter(v => v.last_watched).sort((a,b) => new Date(b.last_watched) - new Date(a.last_watched))[0];
                            const inProgress = course.videos.find(v => v.progress > 0);
                            const target = lastWatched || inProgress || course.videos.find(v => v.is_downloaded);
                            if (target) navigate(`/watch/${course.id}/${target.id}`);
                        }}
                        styles={{
                            root: {
                                backgroundColor: 'white',
                                color: 'black',
                                fontWeight: 'bold',
                                fontSize: '1.6rem',
                                height: '64px',
                                padding: '0 32px',
                                border: 'none',
                                borderRadius: '8px',
                                '&:hover': {
                                    backgroundColor: 'rgba(255, 255, 255, 0.75)',
                                    color: 'black'
                                }
                            }
                        }}
                    >
                        {course.videos.some(v => v.progress > 0 || v.last_watched) ? 'Resume' : 'Play'}
                    </Button>
                </Group>
            </Container>
        </div>
    );
}
