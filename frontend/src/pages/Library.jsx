import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useMediaQuery } from '@mantine/hooks';
import { Container, Title } from '@mantine/core';
import { Carousel } from '@mantine/carousel';
import CourseCard from '../components/Course/CourseCard';
import HeroSection from '../components/Hero/HeroSection';

export default function Library({ onCourseClick }) {
    const [data, setData] = useState([]);
    const [allCourses, setAllCourses] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const isMobile = useMediaQuery('(max-width: 768px)');
    
    const [searchParams] = useSearchParams();
    const group = searchParams.get('group');
    const [navbarConfig, setNavbarConfig] = useState([]);
    const navigate = useNavigate();

    useEffect(() => { 
        fetch('/api/settings/navbar').then(r => r.json()).then(data => {
            let config = [];
            if (Array.isArray(data)) config = data;
            else config = Object.entries(data).map(([k, v]) => ({ name: k, categories: v }));
            
            setNavbarConfig(config);
            
            // Default to first group if none selected and config exists
            if (!group && config.length > 0) {
                navigate(`/?group=${encodeURIComponent(config[0].name)}`, { replace: true });
            }
        });
        fetch('/api/homepage').then(r => r.json()).then(d => {
            setData(d);
            const flat = [];
            d.forEach(cat => cat.sub_categories.forEach(sub => flat.push(...sub.courses)));
            setAllCourses(flat);
        }); 
    }, []);

    // Handle case where group is removed or invalid, or initial load race condition
    useEffect(() => {
        if (group) {
            localStorage.setItem('lastGroup', group);
        }
        if (!group && navbarConfig.length > 0) {
             navigate(`/?group=${encodeURIComponent(navbarConfig[0].name)}`, { replace: true });
        }
    }, [group, navbarConfig, navigate]);

    const filteredData = useMemo(() => {
        if (!group) return data;
        const groupConfig = navbarConfig.find(g => g.name === group);
        if (!groupConfig) return data;
        const allowedCats = groupConfig.categories;
        return data.filter(cat => allowedCats.includes(cat.category));
    }, [data, group, navbarConfig]);

    const heroCourses = useMemo(() => {
        if (!group) return allCourses;
        const flat = [];
        filteredData.forEach(cat => cat.sub_categories.forEach(sub => flat.push(...sub.courses)));
        return flat;
    }, [allCourses, filteredData, group]);

    const continueWatching = useMemo(() => {
        const courses = [];
        filteredData.forEach(cat => {
            cat.sub_categories.forEach(sub => {
                sub.courses.forEach(c => {
                    if (c.resume_video_id) {
                        courses.push(c);
                    }
                });
            });
        });
        return courses.sort((a, b) => {
            if (a.last_watched && b.last_watched) {
                return new Date(b.last_watched) - new Date(a.last_watched);
            }
            return 0;
        });
    }, [filteredData]);

    const handleClearHistory = (courseId) => {
        if(!confirm("Remove from Continue Watching?")) return;
        fetch(`/api/history/clear/${courseId}`, { method: 'POST' })
            .then(() => {
                fetch('/api/homepage').then(r => r.json()).then(setData);
            });
    };

    const handleCategoryClick = (category) => {
        if (selectedCategory === category) {
            setSelectedCategory(null);
        } else {
            setSelectedCategory(category);
        }
    };

    return (
        <div style={{ background: '#141414', minHeight: '100vh', paddingBottom: '50px' }}>
            <HeroSection courses={heroCourses} onCourseClick={onCourseClick} />
            <Container size="xl" fluid px={isMobile ? 0 : '3rem'} style={{ marginTop: isMobile ? '-1vh' : '-10vw', position: 'relative', zIndex: 20 }}>
                
                {continueWatching.length > 0 && (
                    <div style={{ marginBottom: '3rem', paddingLeft: isMobile ? '1rem' : 0 }}>
                        <Title order={3} mb="md" c="white" style={{ fontWeight: 700, fontSize: isMobile ? '1.2rem' : '1.5rem' }}>
                            Continue Watching
                        </Title>
                        <Carousel 
                            withIndicators={false} 
                            withControls={false}
                            slideSize={{ base: '50%', sm: '33.33%', md: '25%', lg: '20%' }} 
                            slideGap="xs" 
                            align="start" 
                            slidesToScroll={2}
                            loop={false}
                        >
                            {continueWatching.map(c => (
                                <CourseCard 
                                    key={c.id} 
                                    course={c} 
                                    onClear={handleClearHistory}
                                    onClick={() => onCourseClick && onCourseClick(c.id)}
                                />
                            ))}
                        </Carousel>
                    </div>
                )}

                {filteredData.map(catData => (
                    <div key={catData.category} style={{ marginBottom: '3rem', paddingLeft: isMobile ? '1rem' : 0 }}>
                        <Title 
                            order={3} 
                            mb="md" 
                            c="white" 
                            style={{ fontWeight: 700, fontSize: isMobile ? '1.2rem' : '1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            onClick={() => handleCategoryClick(catData.category)}
                        >
                            {catData.category}
                        </Title>
                        
                        {/* If category is selected, show subcategories. Otherwise, show all courses in one carousel */}
                        {selectedCategory === catData.category ? (
                            catData.sub_categories.map(sub => (
                                <div key={sub.name} style={{ marginBottom: '2.5rem', paddingLeft: '1rem' }}>
                                    <Title order={5} mb="xs" c="gray.5" style={{ fontSize: '1.1rem', fontWeight: 500 }}>{sub.name}</Title>
                                    <Carousel 
                                        withIndicators={false} 
                                        withControls={false}
                                        slideSize={{ base: '50%', sm: '33.33%', md: '25%', lg: '20%' }} 
                                        slideGap="xs" 
                                        align="start" 
                                        slidesToScroll={2}
                                        loop
                                    >
                                        {sub.courses.map(c => <CourseCard key={c.id} course={c} onClick={() => onCourseClick && onCourseClick(c.id)} />)}
                                    </Carousel>
                                </div>
                            ))
                        ) : (
                            <Carousel 
                                withIndicators={false} 
                                withControls={false}
                                slideSize={{ base: '50%', sm: '33.33%', md: '25%', lg: '20%' }} 
                                slideGap="xs" 
                                align="start" 
                                slidesToScroll={2}
                                loop
                            >
                                {catData.sub_categories.flatMap(sub => sub.courses).map(c => <CourseCard key={c.id} course={c} onClick={() => onCourseClick && onCourseClick(c.id)} />)}
                            </Carousel>
                        )}
                    </div>
                ))}
            </Container>
        </div>
    );
}
