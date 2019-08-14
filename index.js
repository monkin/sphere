const canvas = document.querySelector("canvas");

let resizeRequested = true,
    ratio = 1,
    width = 0,
    height = 0;

function resize() {
    const w = canvas.clientWidth,
        h = canvas.clientHeight,
        px = window.devicePixelRatio || 1;
    ratio = w / h;
    width = w * px;
    height = h * px;

    canvas.setAttribute("width", width.toFixed(0));
    canvas.setAttribute("height", height.toFixed(0));
    gl.viewport(0, 0, width, height);
}

const gl = canvas.getContext("webgl", { antialias: false, depth: false, premultipliedAlpha: false }),
    points = gl.createBuffer();

gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

gl.bindBuffer(gl.ARRAY_BUFFER, points);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

function createStage() {
    const start = Date.now(),
        STAGE_DURATION = 10000;
    let now = start;
    return {
        next() {
            if (now - start > STAGE_DURATION) {
                return Promise.resolve(false);
            } else {
                return new Promise(resolve => {
                    requestAnimationFrame(() => {
                        now = Date.now();
                        resolve(true);
                    });
                });
            }
        },
        time() {
            return Math.min(1, (now - start) / STAGE_DURATION);
        }
    };
}

function compile(vertexSource, fragmentSource) {
    let vshader = gl.createShader(gl.VERTEX_SHADER),
        fshader = gl.createShader(gl.FRAGMENT_SHADER),
        program = gl.createProgram();

    gl.shaderSource(vshader, vertexSource);
    gl.compileShader(vshader);

    gl.shaderSource(fshader, fragmentSource);
    gl.compileShader(fshader);
    
    gl.attachShader(program, vshader);
    gl.attachShader(program, fshader);
    gl.linkProgram(program);

    if (!gl.getShaderParameter(vshader, gl.COMPILE_STATUS)) {
        throw new Error("Error compiling vertex shader: " + gl.getShaderInfoLog(vshader) + "\n" + vertexSource);
    }
    if (!gl.getShaderParameter(fshader, gl.COMPILE_STATUS)) {
        throw new Error("Error compiling fragment shader: " + gl.getShaderInfoLog(fshader) + "\n" + fragmentSource);
    }
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error("Error linking shaders: " + gl.getProgramInfoLog(program) + "\n" + vertexSource + "\n---\n" + fragmentSource);
    }

    const position = gl.getAttribLocation(program, "a_point");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    return program;
}

function easing(time) {
    const SWITCH_TIME = 1 / 2;
    if (time < SWITCH_TIME) {
        const t = time / SWITCH_TIME;
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) *t;
    } else {
        return 1;
    }
}

function mix(a, b, v) {
    let r = [];
    for (let i = 0; i < a.length; i++) {
        r[i] = a[i] * (1 - v) + b[i] * v;
    }
    return r;
}

function randomSeed() {
    let r = [];
    for (let i = 0; i < 64; i++) {
        r[i] = Math.random();
    }
    return r;
}

setTimeout(async function() {
    let ballProgram = compile(ballVertexSource, ballFragmentSource),
        bgProgram = compile(bgVertexSource, bgFragmentSource),
        ballRatioLocation = gl.getUniformLocation(ballProgram, "u_ratio"),
        ballPixelSizeLocation = gl.getUniformLocation(ballProgram, "u_pixelSize"),
        ballTimeLocation = gl.getUniformLocation(ballProgram, "u_time"),
        seedLocation = gl.getUniformLocation(ballProgram, `u_seed`),
        bgRatioLocation = gl.getUniformLocation(bgProgram, "u_ratio"),
        start = Date.now(),
        seed1 = randomSeed(),
        seed2 = randomSeed();

    while (true) {
        const stage = createStage();

        seed1 = seed2;
        seed2 = randomSeed();

        while (await stage.next()) {
            resize();
            const time = Date.now() - start;

            gl.useProgram(bgProgram);
            gl.uniform1f(bgRatioLocation, ratio);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            gl.useProgram(ballProgram);
            gl.uniform1f(ballRatioLocation, ratio);
            gl.uniform1f(ballPixelSizeLocation, 1 / (Math.min(width, height) * 0.75));
            gl.uniform1f(ballTimeLocation, time);
            gl.uniform1fv(seedLocation, mix(seed1, seed2, easing(stage.time())));

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
    }
});

const lightSource = "vec3(-2, -4, -5)";

const bgVertexSource = `
attribute vec2 a_point;
varying vec2 v_point;
uniform float u_ratio;
void main() {
    vec2 p = a_point * (1.0 / 0.8);
    v_point = (u_ratio > 1.0
        ? vec2(p.x * u_ratio, p.y)
        : vec2(p.x, p.y / u_ratio)) * vec2(1.2, 2) + vec2(0, 1.35);
    gl_Position = vec4(a_point, 0, 1);
}`;

const bgFragmentSource = `
precision highp float;
varying vec2 v_point;

void main() {
    float l = length(v_point);
    if (l < 1.0) {
        gl_FragColor = vec4(0.25 + 0.75 * vec3(l), 1);
    } else {
        gl_FragColor = vec4(1);
    }
}`;

const ballVertexSource = `
attribute vec2 a_point;
varying vec2 v_point;
uniform float u_ratio;
void main() {
    v_point = a_point;
    gl_Position = u_ratio > 1.0
            ? vec4(a_point.x / u_ratio * 0.8, a_point.y * 0.8, 0, 1)
            : vec4(a_point.x * 0.8, a_point.y * u_ratio * 0.8, 0, 1);
}`;

const ballFragmentSource = `
precision highp float;
varying vec2 v_point;
uniform float u_time;
uniform float u_pixelSize;
uniform float u_seed[64];

#define M_PI 3.1415926535897932384626433832795

float mirror(float v) { float c = mod(abs(v), 2.0); return c <= 1.0 ? c : 2.0 - c; }
vec2 mirror(vec2 v) { return vec2(mirror(v.x), mirror(v.y)); }
vec3 mirror(vec3 v) { return vec3(mirror(v.x), mirror(v.y), mirror(v.z)); }

float easing(float t) { return t < 0.5 ? 2.0 * t * t : -1.0 + (4.0 - 2.0 * t) * t; }
vec2 easing(vec2 t) { return vec2(easing(t.x), easing(t.y)); }
vec3 easing(vec3 t) { return vec3(easing(t.x), easing(t.y), easing(t.z)); }

vec3 layer(vec3 point) {
    vec3 v1 = easing(mirror(#3 * distance(point, #3 * 2.0 - 1.0) * 5.0 + #3));
    vec3 v2 = easing(mirror(#3 * distance(point, #3 * 2.0 - 1.0) * 10.0 + #3));
    vec3 v3 = easing(mirror(#3 * distance(point, #3 * 2.0 - 1.0) * 20.0 + #3));

    return mix(v1, v2, v3);
}

vec3 rotateY(vec3 point, float angle) {
    float s = sin(angle),
        c = cos(angle);
    return vec3(point.x * c - point.z * s, point.y, point.z * c + point.x * s);
}

void main() {
    float delta = length(v_point);
    if (delta < 1.0) {
        vec3 point = vec3(v_point, sqrt(1.0 - delta * delta));
        vec3 tex = layer(rotateY(point, - u_time / 4000.0));
        vec3 source = ${lightSource};
        vec3 light = normalize(point - source);
        vec3 n = normalize(point + tex * 0.2 - 0.1);
        float alpha = (1.0 - delta) < u_pixelSize ? (1.0 - delta) / u_pixelSize : 1.0;
        float ambient = 0.05;
        float diffuse = max(0.0, dot(n, light));
        float specular = 0.8 * pow(max(0.0, dot(normalize(reflect(light, n)), vec3(0, 0, -1))), 15.0);

        vec3 color = 0.1 + tex * 0.4 * (ambient + diffuse) + specular;
        gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), alpha);
    } else {
        gl_FragColor = vec4(0);
    }
}`.replace(/#\d/g, (() => {
    let i = 0,
        v = () => `u_seed[${i++ % 64}]`;
    return s => {
        if (s === "#1") {
            return v();
        } else if (s === "#2") {
            return `vec2(${v()}, ${v()})`;
        } else if (s === "#3") {
            return `vec3(${v()}, ${v()}, ${v()})`;
        }
    };
})());

console.log(ballVertexSource);
console.log(ballFragmentSource);
