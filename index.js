const canvas = document.querySelector("canvas");

let resizeRequested = true,
    ratio = 1,
    width = 0,
    height = 0;

function resize() {
    if (resizeRequested) {
        const w = document.body.clientWidth,
            h = document.body.clientHeight,
            px = window.devicePixelRatio || 1;
        ratio = w / h;
        width = w * px;
        height = h * px;

        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        canvas.setAttribute("width", width.toFixed(0));
        canvas.setAttribute("height", height.toFixed(0));
        gl.viewport(0, 0, w * px, h * px);
        resizeRequested = false;
    }
}
window.addEventListener("resize", () => resizeRequested = true);

const gl = canvas.getContext("webgl", { antialias: false, depth: false, premultipliedAlpha: false }),
    points = gl.createBuffer();

gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
gl.bindBuffer(gl.ARRAY_BUFFER, points);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

function createStage() {
    const start = Date.now(),
        STAGE_DURATION = 1000;
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

const program = (function() {
    let program = null,
        vshader = null,
        fshader = null;
    return {
        get handle() {
            return program;
        },
        update(vertex, fragment) {
            program && gl.deleteProgram(program);
            vshader && gl.deleteShader(vshader);
            fshader && gl.deleteShader(fshader);

            vshader = gl.createShader(gl.VERTEX_SHADER);
            fshader = gl.createShader(gl.FRAGMENT_SHADER);
            program = gl.createProgram();

            gl.useProgram(null);

            gl.shaderSource(vshader, vertex);
            gl.compileShader(vshader);
            if (!gl.getShaderParameter(vshader, gl.COMPILE_STATUS)) {
                throw new Error("Error compiling vertex shader: " + gl.getShaderInfoLog(vshader) + "\n" + vertex);
            }

            gl.shaderSource(fshader, fragment);
            gl.compileShader(fshader);
            if (!gl.getShaderParameter(fshader, gl.COMPILE_STATUS)) {
                throw new Error("Error compiling fragment shader: " + gl.getShaderInfoLog(fshader) + "\n" + fragment);
            }

            gl.attachShader(program, vshader);
            gl.attachShader(program, fshader);
            gl.linkProgram(program);

            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                throw new Error("Error linking shaders: " + gl.getProgramInfoLog(program) + "\n" + vertex + "\n---\n" + fragment);
            }

            const position = gl.getAttribLocation(program, "a_point");
            gl.enableVertexAttribArray(position);
            gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

            gl.useProgram(program);
        }
    };
})();


function easing(time) {
    const SWITCH_TIME = 1 / 2;
    if (time < SWITCH_TIME) {
        const t = time / SWITCH_TIME;
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) *t;
    } else {
        return 1;
    }
}

const INITIAL_RENDER_PARAMETERS = {
    lib: `vec3 color_fn(vec2 point) { return vec3(0.5, 0.5, 0.5); }`,
    color: "color_fn"
};

function generateRenderParameters() {
    let color = tScale(3, randomTexture(3, 30));
    return {
        lib: color.lib,
        color: color.fn
    };
}

setTimeout(async function() {
    let start = Date.now(),
        p1 = INITIAL_RENDER_PARAMETERS,
        p2 = INITIAL_RENDER_PARAMETERS;
        
    while (true) {
        p1 = p2;
        p2 = generateRenderParameters();
        program.update(`
            attribute vec2 a_point;
            varying vec2 v_point;
            uniform float u_ratio;
            void main() {
                v_point = a_point;
                gl_Position = u_ratio > 1.0
                        ? vec4(a_point.x / u_ratio * 0.85, a_point.y * 0.85, 0, 1)
                        : vec4(a_point.x * 0.85, a_point.y * u_ratio * 0.85, 0, 1);
            }
        `, `
            precision highp float;
            varying vec2 v_point;
            uniform float u_transition;
            uniform float u_pixelSize;
            float mirror(float v) { float x = mod(mod(v, 2.0) + 2.0, 2.0); return x > 1.0 ? 2.0 - x : x; }
            vec2 mirror(vec2 v) { return vec2(mirror(v.x), mirror(v.y)); }
            vec3 mirror(vec3 v) { return vec3(mirror(v.x), mirror(v.y), mirror(v.z)); }
            ${p1.lib}
            ${p2.lib}
            void main() {
                float delta = length(v_point);
                if (delta < 1.0) {
                    vec2 p = v_point * 0.5 + 0.5;
                    vec3 point = vec3(v_point, 1.0 - length(v_point));
                    vec3 light = normalize(vec3(0, -2, -4) - point);
                    float alpha = (1.0 - delta) < u_pixelSize ? (1.0 - delta) / u_pixelSize : 1.0;
                    vec3 color = mix(${p1.color}(p), ${p2.color}(p), vec3(u_transition));
                    gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), alpha);
                } else {
                    gl_FragColor = vec4(0);
                }
            }
        `);
        const stage = createStage(),
            prog = program.handle,
            ratioLocation = gl.getUniformLocation(prog, "u_ratio"),
            transitionLocation = gl.getUniformLocation(prog, "u_transition"),
            pixelSizeLocation = gl.getUniformLocation(prog, "u_pixelSize");
        while (await stage.next()) {
            resize();
            const time = Date.now() - start,
                transition = easing(stage.time());
            gl.clearColor(0.9, 0.9, 0.9, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
            
            gl.uniform1f(ratioLocation, ratio);
            gl.uniform1f(transitionLocation, transition);
            gl.uniform1f(pixelSizeLocation, 1 / (Math.min(width, height) * 0.75));
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
    }
});

////////////////////////////////////////////////
// Generators
////////////////////////////////////////////////

let nextId = (() => {
    let counter = 0;
    return () => `x${(counter++).toFixed(0)}`;
})();

function type(d) {
    if (d === 1) {
        return "float";
    } else {
        return `vec${d}`;
    }
}

function random(d) {
    if (d === 1) {
        return Math.random().toFixed(6);
    } else {
        let v = "";
        for (let i = 0; i < d; i++) {
            if (i) {
                v += ", ";
            }
            v += Math.random().toFixed(6);
        }
        return `${type(d)}(${v})`;
    }
}

function randomConstant(dimentions) {
    const f = `const_${nextId()}`,
        t = type(dimentions);
    return {
        fn: f,
        lib: `${t} ${f}(vec2 p) { return ${random(dimentions)}; }`
    };
}

function constant(d, value) {
    if (d === 1) {
        return value.toFixed(6);
    } else {
        return `${type(d)}(${value.toFixed(6)})`
    }
}

function select(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomTexture(dimentions, complexity) {
    if (complexity < 1) {
        return randomConstant(dimentions);
    } else {
        let r = Math.random();
        if (r < 0.5 && complexity > 10) {
            if (Math.random() < 0.99) {
                const a = randomTexture(dimentions, complexity / 2),
                    b = randomTexture(dimentions, complexity / 2),
                    alpha = randomTexture(1, complexity / 2);
                return blend(dimentions, a, b, alpha);
            } else {
                const v = randomTexture(dimentions, complexity / 2),
                    point = randomTexture(2, complexity / 2);
                return displace(dimentions, v, point);
            }
        } else if (r < 0.75 && complexity > 3) {
            return select(transformers)(dimentions, randomTexture(dimentions, complexity - 1));
        } else {
            const a = randomTexture(dimentions, complexity / 2),
                b = randomTexture(dimentions, complexity / 2);
            return select(combinators)(dimentions, a, b);
        }
    }
}

////////////////////////////////////////////////
// Complex combinations
////////////////////////////////////////////////

function displace(d, v, point) {
    const f = `displace_${nextId()}`,
        t = type(d);
    return {
        fn: f,
        lib: `${v.lib}\n${point.lib}\n${t} ${f}(vec2 p) { return ${v.fn}(${point.fn}(p)); }`
    };
}

function blend(d, a, b, alpha) {
    const f = `blend_${nextId()}`,
        t = type(d);
    return {
        fn: f,
        lib: `${a.lib}\n${b.lib}\n${alpha.lib}\n${t} ${f}(vec2 p) { float a = ${alpha.fn}(p); return ${a.fn}(p) * a + ${b.fn}(p) * (1.0 - a); }`
    };
}

////////////////////////////////////////////////
// Combinators
////////////////////////////////////////////////

const combinators = [
    //cMix1,
    //cMixN,
    cMixQuad,
    //cMixPower
];

function cMix1(d, a, b) {
    const f = `mix1_${nextId()}`,
        t = type(d),
        v = Math.random(),
        v1 = v.toFixed(6),
        v2 = (1 - v).toFixed(6);
    return {
        fn: f,
        lib: `${a.lib}\n${b.lib}\n${t} ${f}(vec2 p) { return ${a.fn}(p) * ${v1} + ${b.fn}(p) * ${v2}; }`
    };
}

function cMixN(d, a, b) {
    const f = `mixN_${nextId()}`,
        t = type(d),
        v = Math.random(),
        v1 = v.toFixed(6),
        v2 = (1 - v).toFixed(6);
    return {
        fn: f,
        lib: `${a.lib}\n${b.lib}\n${t} ${f}(vec2 p) { ${t} m = ${random(d)}; return ${a.fn}(p) * m + ${b.fn}(p) * (1.0 - m); }`
    };
}

function cMixQuad(d, a, b) {
    const f = `mixQuad_${nextId()}`,
        t = type(d),
        m = Math.random(),
        v = `mirror(p.x * ${m.toFixed(6)} + p.y * ${(1 - m).toFixed(6)} - 0.5)`;
    return {
        fn: f,
        lib: `${a.lib}\n${b.lib}\n${t} ${f}(vec2 p) { float v = ${v}; float w = v * v * 4.0; return ${a.fn}(p) * w + ${b.fn}(p) * (1.0 - w); }`
    };
}

function cMixPower(d, a, b) {
    const f = `mixPower_${nextId()}`,
        t = type(d),
        p1 = constant(d, Math.random() * 2.0 + 1.0),
        p2 = constant(d, Math.random() * 2.0 + 1.0);
    return {
        fn: f,
        lib: `${a.lib}\n${b.lib}\n${t} ${f}(vec2 p) { return pow(pow(${a.fn}(p), ${p1}) * pow(${b.fn}(p), ${p2}), 1.0 / (${p1} + ${p2})); }`
    };
}

////////////////////////////////////////////////
// Transformers
////////////////////////////////////////////////

const transformers = [
    tShift,
    tRotate,
    tScale
];

function tShift(d, fn) {
    const f = `shift_${nextId()}`,
        t = type(d);
    return {
        fn: f,
        lib: `${fn.lib}\n${t} ${f}(vec2 p) { return ${fn.fn}(/*mirror*/(p + ${random(2)})); }`
    };
}

function tRotate(d, fn) {
    const f = `rotate_${nextId()}`,
        t = type(d),
        a = Math.random() * Math.PI,
        s = Math.sin(a),
        c = Math.cos(a),
        x = `/*mirror*/(p.x * (${c.toFixed(6)}) + p.y * (${s.toFixed(6)}) + 2.0)`,
        y = `/*mirror*/(p.y * (${c.toFixed(6)}) - p.x * (${s.toFixed(6)}) + 2.0)`;
    return {
        fn: f,
        lib: `${fn.lib}\n${t} ${f}(vec2 p) { return ${fn.fn}(vec2(${x}, ${y})); }`
    };
}

function tScale(d, fn) {
    const f = `scale_${nextId()}`,
        t = type(d);
    return {
        fn: f,
        lib: `${fn.lib}\n${t} ${f}(vec2 p) { return ${fn.fn}(mirror(p * 2.0)); }`
    };
}
