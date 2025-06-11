const sr= ScrollReveal({
origin :'bottom',
distance: '70px',
duration:3000,
delay:300,
// reset: true,
});
//          Hero section
//hero text
sr.reveal('.hero-text',{origin:'left'});

//image
sr.reveal('.img',{origin:'right',distance:'150px'});

//          features section
//text
sr.reveal('.features-text',{origin:'bottom',distance:'60px',interval:100,delay:100});


//features
sr.reveal('.encryption',{origin:'left',distance:'60px',interval:100,delay:200});
sr.reveal('.cross',{origin:'left',distance:'60px',interval:100,delay:500});
sr.reveal('.video',{origin:'left',distance:'60px',interval:100,delay:600});
sr.reveal('.nat',{origin:'left',distance:'60px',interval:100,delay:700});
sr.reveal('.screen',{origin:'left',distance:'60px',interval:100,delay:800});
sr.reveal('.file',{origin:'left',distance:'60px',interval:100,delay:900});

