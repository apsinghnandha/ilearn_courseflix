import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Carousel } from '@mantine/carousel';
import { useMediaQuery } from '@mantine/hooks';
import { Container, Group, Button, Text } from '@mantine/core';
import { PlayerPlay, InfoCircle } from 'tabler-icons-react';
import { getSvgDesign, HERO_START_SCALE, HERO_END_SCALE } from '../../utils/design';

function HeroSlide({ course, isActive, navigate, isMobile, onCourseClick }) {
    const [animate, setAnimate] = useState(false);
    
    useEffect(() => {
        if (isActive) {
            setAnimate(false);
            const timer = setTimeout(() => setAnimate(true), 3000);
            return () => clearTimeout(timer);
        } else {
            setAnimate(false);
        }
    }, [isActive]);

    const design = useMemo(() => getSvgDesign(course.title), [course.title]);
    const START_SCALE = HERO_START_SCALE; 
    const END_SCALE = HERO_END_SCALE; 

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
                        fontSize="104"
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
            height: '100%',
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
                paddingBottom: isMobile ? '20%' : '15%'
            }}>
                <div style={{ 
                    transition: 'all 1s cubic-bezier(0.4, 0, 0.2, 1)', 
                    transform: animate ? `scale(${END_SCALE.toFixed(3)})` : `scale(${START_SCALE})`,
                    transformOrigin: 'bottom left',
                    marginBottom: '0.5rem',
                    maxWidth: isMobile ? '100%' : '60%',
                    zIndex: 12
                }}>
                    {renderSvgTitle()}
                </div>
                
                <div style={{
                    transition: 'all 1s cubic-bezier(0.4, 0, 0.2, 1)',
                    opacity: animate ? 0 : 1,
                    maxHeight: animate ? 0 : '100px',
                    overflow: 'hidden',
                    marginBottom: animate ? 0 : '1.5rem'
                }}>
                    {course.carousel_info && (
                        <Text style={{
                            color: '#fff',
                            fontSize: isMobile ? '1.16rem' : '1.39vw',
                            fontWeight: 400,
                            lineHeight: 1.2,
                            textShadow: '2px 2px 4px rgba(0, 0, 0, .45)',
                            maxWidth: isMobile ? '100%' : '40%',
                            width: 'fit-content',
                            whiteSpace: 'normal',
                            wordWrap: 'break-word',
                            display: 'block'
                        }}>
                            {course.carousel_info}
                        </Text>
                    )}
                </div>

                <Group style={{ transform: animate ? `scale(${(START_SCALE * 0.9 * 1.05).toFixed(3)})` : `scale(${START_SCALE})`, transformOrigin: 'left bottom', transition: 'all 1s cubic-bezier(0.4, 0, 0.2, 1)', zIndex: 11 }}>
                    <Button 
                        size={isMobile ? 'md' : 'lg'} 
                        color="white" 
                        c="black" 
                        leftSection={<PlayerPlay size={32} fill="black" />}
                        onClick={() => navigate(course.resume_video_id ? `/watch/${course.id}/${course.resume_video_id}` : `/watch/${course.id}/first`)}
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
                        {course.resume_video_id ? "Resume" : "Play"}
                    </Button>
                    <Button 
                        size={isMobile ? 'md' : 'lg'} 
                        variant="filled" 
                        color="rgba(109, 109, 110, 0.7)" 
                        c="white"
                        leftSection={<InfoCircle size={32} />}
                        onClick={() => {
                            if (onCourseClick) onCourseClick(course.id);
                            else navigate(`/course/${course.id}`);
                        }}
                        styles={{
                            root: {
                                backgroundColor: 'rgba(109, 109, 110, 0.7)',
                                color: 'white',
                                fontWeight: 'bold',
                                fontSize: '1.6rem',
                                height: '64px',
                                padding: '0 32px',
                                border: 'none',
                                borderRadius: '8px',
                                '&:hover': {
                                    backgroundColor: 'rgba(109, 109, 110, 0.4)'
                                }
                            }
                        }}
                    >
                        More Info
                    </Button>
                </Group>
            </Container>
        </div>
    );
}

export default function HeroSection({ courses, onCourseClick }) {
    const [featuredCourses, setFeaturedCourses] = useState([]);
    const [activeSlide, setActiveSlide] = useState(0);
    const navigate = useNavigate();
    const isMobile = useMediaQuery('(max-width: 768px)');

    useEffect(() => {
        if (courses.length > 0) {
            const shuffled = [...courses].sort(() => 0.5 - Math.random());
            setFeaturedCourses(shuffled.slice(0, 5));
        }
    }, [courses]);

    if (featuredCourses.length === 0) return null;

    return (
        <Carousel 
            withIndicators={false}
            height={isMobile ? '70vh' : '56.25vw'}
            loop 
            withControls={false}
            draggable={false}
            onSlideChange={setActiveSlide}
            styles={{
                root: { width: '100%' }
            }}
        >
            {featuredCourses.map((course, index) => (
                <Carousel.Slide key={course.id}>
                    <HeroSlide 
                        course={course} 
                        isActive={activeSlide === index} 
                        navigate={navigate} 
                        isMobile={isMobile} 
                        onCourseClick={onCourseClick}
                    />
                </Carousel.Slide>
            ))}
        </Carousel>
    );
}
