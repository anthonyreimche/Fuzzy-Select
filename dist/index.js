//#region src/rt.ts
var e, t;
function n(n) {
	t = n, e = n.react;
}
function r(e, t, n) {
	return e < t ? t : e > n ? n : e;
}
function i(e, t) {
	return typeof e == "number" && Number.isFinite(e) ? e : t;
}
function a(e) {
	let t = [];
	if (Array.isArray(e.seeds)) for (let n of e.seeds) {
		if (t.length >= 64) break;
		if (typeof n != "object" || !n) continue;
		let { u: e, v: i, subtract: a } = n;
		if (typeof e != "number" || typeof i != "number" || !Number.isFinite(e) || !Number.isFinite(i)) continue;
		let o = {
			u: r(e, 0, 1),
			v: r(i, 0, 1)
		};
		a === !0 && (o.subtract = !0), t.push(o);
	}
	return {
		seeds: t,
		tolerance: r(i(e.tolerance, 15), 0, 100),
		feather: r(i(e.feather, 10), 0, 100)
	};
}
function o({ width: e, height: t, data: n }) {
	let r = new Float32Array(e * t * 3);
	for (let i = 0, a = e * t; i < a; i++) {
		let e = n[i * 4], t = n[i * 4 + 1], a = n[i * 4 + 2], o = e < 0 ? 0 : e > 1 ? 1 : e, s = t < 0 ? 0 : t > 1 ? 1 : t, c = a < 0 ? 0 : a > 1 ? 1 : a, l = Math.cbrt(.4122214708 * o + .5363325363 * s + .0514459929 * c), u = Math.cbrt(.2119034982 * o + .6806995451 * s + .1073969566 * c), d = Math.cbrt(.0883024619 * o + .2817188376 * s + .6299787005 * c);
		r[i * 3] = .2104542553 * l + .793617785 * u - .0040720468 * d, r[i * 3 + 1] = 1.9779984951 * l - 2.428592205 * u + .4505937099 * d, r[i * 3 + 2] = .0259040371 * l + .7827717662 * u - .808675766 * d;
	}
	return r;
}
function s(e, t, n, r, i) {
	let a = 0, o = 0, s = 0, c = 0;
	for (let l = Math.max(0, i - 1); l <= Math.min(n - 1, i + 1); l++) for (let n = Math.max(0, r - 1); n <= Math.min(t - 1, r + 1); n++) {
		let r = (l * t + n) * 3;
		a += e[r], o += e[r + 1], s += e[r + 2], c++;
	}
	return [
		a / c,
		o / c,
		s / c
	];
}
function c(e, t, n, r, i, a, o) {
	let s = new Uint8Array(t * n), c = o * o, [l, u, d] = a, f = (t) => {
		if (s[t]) return !1;
		let n = e[t * 3] - l, r = e[t * 3 + 1] - u, i = e[t * 3 + 2] - d;
		return n * n + r * r + i * i <= c;
	}, p = [], m = i * t + r;
	for (p.push(r, i), s[m] = 1; p.length > 0;) {
		let e = p.pop(), r = p.pop(), i = r;
		for (; i > 0 && f(e * t + i - 1);) i--;
		let a = r;
		for (; a < t - 1 && f(e * t + a + 1);) a++;
		for (let n = i; n <= a; n++) s[e * t + n] = 1;
		for (let r of [e - 1, e + 1]) {
			if (r < 0 || r >= n) continue;
			let e = !1;
			for (let n = i; n <= a; n++) {
				let i = f(r * t + n);
				i && !e && p.push(n, r), e = i;
			}
		}
	}
	return s;
}
function l(e, t, n, r, i) {
	if (!(r.u >= 0 && r.u < 1 && r.v >= 0 && r.v < 1)) return null;
	let a = Math.min(t - 1, Math.floor(r.u * t)), o = Math.min(n - 1, Math.floor(r.v * n)), l = s(e, t, n, a, o), u = c(e, t, n, a, o, l, i), d = new Uint8Array(t * n), f = i * .25 + 1e-4;
	for (let r = 0; r < n; r++) for (let a = 0; a < t; a++) {
		let o = r * t + a;
		if (u[o]) {
			d[o] = 255;
			continue;
		}
		if (!(a > 0 && u[o - 1] === 1 || a < t - 1 && u[o + 1] === 1 || r > 0 && u[o - t] === 1 || r < n - 1 && u[o + t] === 1)) continue;
		let s = e[o * 3] - l[0], c = e[o * 3 + 1] - l[1], p = e[o * 3 + 2] - l[2], m = Math.sqrt(s * s + c * c + p * p);
		d[o] = Math.round(255 * Math.max(0, 1 - (m - i) / f));
	}
	return d;
}
function u(e, t, n, r, i, a) {
	let o = e[n], s = e[n + (i - 1) * r], c = 0;
	for (let t = -a; t <= a; t++) c += t < 0 ? o : t >= i ? s : e[n + t * r];
	let l = 1 / (2 * a + 1);
	for (let u = 0; u < i; u++) {
		t[n + u * r] = c * l;
		let d = u - a, f = u + a + 1;
		c += (f >= i ? s : e[n + f * r]) - (d < 0 ? o : e[n + d * r]);
	}
}
function d(e, t, n, i) {
	let a = new Float32Array(e), o = new Float32Array(e.length);
	for (let e = 0; e < 3; e++) {
		for (let e = 0; e < n; e++) u(a, o, e * t, 1, t, i);
		for (let e = 0; e < t; e++) u(o, a, e, t, n, i);
	}
	let s = new Uint8Array(e.length);
	for (let e = 0; e < s.length; e++) s[e] = Math.round(r(a[e], 0, 255));
	return s;
}
function f(e, t) {
	let { width: n, height: i } = e, a = new Uint8Array(n * i);
	if (t.seeds.length === 0 || n === 0 || i === 0) return a;
	let s = o(e), c = r(t.tolerance, 0, 100) / 100 * .5;
	for (let e of t.seeds) {
		let t = l(s, n, i, e, c);
		if (t) {
			if (e.subtract) for (let e = 0; e < a.length; e++) a[e] = Math.round(a[e] * (255 - t[e]) / 255);
			else for (let e = 0; e < a.length; e++) t[e] > a[e] && (a[e] = t[e]);
		}
	}
	let u = r(t.feather, 0, 100) / 100 * .01 * Math.max(n, i);
	return u < .5 ? a : d(a, n, i, Math.round(u));
}
//#endregion
//#region src/controls.tsx
function p({ values: n, setValues: r, commit: i }) {
	let { Slider: o } = t.components, { Button: s } = t.ui, { tolerance: c, feather: l, seeds: u } = a(n);
	return /* @__PURE__ */ e.createElement("div", { className: "flex flex-col gap-2" }, /* @__PURE__ */ e.createElement("div", { title: "How different a colour can be from the clicked point and still be selected" }, /* @__PURE__ */ e.createElement(o, {
		label: "Tolerance",
		value: c,
		min: 0,
		max: 100,
		step: 1,
		defaultValue: 15,
		onChange: (e) => r({ tolerance: e }),
		onCommit: () => i("Fuzzy Select Tolerance")
	})), /* @__PURE__ */ e.createElement("div", { title: "Softens the edge of the selection" }, /* @__PURE__ */ e.createElement(o, {
		label: "Feather",
		value: l,
		min: 0,
		max: 100,
		step: 1,
		defaultValue: 10,
		onChange: (e) => r({ feather: e }),
		onCommit: () => i("Fuzzy Select Feather")
	})), /* @__PURE__ */ e.createElement(s, {
		size: "sm",
		disabled: u.length === 0,
		title: "Remove every clicked point from this component",
		onClick: () => {
			r({ seeds: [] }), i("Clear Fuzzy Select Points");
		}
	}, "Clear points"));
}
//#endregion
//#region src/fill-worker.ts?worker&inline
var m = "(function(){function e(e,t,n){return e<t?t:e>n?n:e}function t({width:e,height:t,data:n}){let r=new Float32Array(e*t*3);for(let i=0,a=e*t;i<a;i++){let e=n[i*4],t=n[i*4+1],a=n[i*4+2],o=e<0?0:e>1?1:e,s=t<0?0:t>1?1:t,c=a<0?0:a>1?1:a,l=Math.cbrt(.4122214708*o+.5363325363*s+.0514459929*c),u=Math.cbrt(.2119034982*o+.6806995451*s+.1073969566*c),d=Math.cbrt(.0883024619*o+.2817188376*s+.6299787005*c);r[i*3]=.2104542553*l+.793617785*u-.0040720468*d,r[i*3+1]=1.9779984951*l-2.428592205*u+.4505937099*d,r[i*3+2]=.0259040371*l+.7827717662*u-.808675766*d}return r}function n(e,t,n,r,i){let a=0,o=0,s=0,c=0;for(let l=Math.max(0,i-1);l<=Math.min(n-1,i+1);l++)for(let n=Math.max(0,r-1);n<=Math.min(t-1,r+1);n++){let r=(l*t+n)*3;a+=e[r],o+=e[r+1],s+=e[r+2],c++}return[a/c,o/c,s/c]}function r(e,t,n,r,i,a,o){let s=new Uint8Array(t*n),c=o*o,[l,u,d]=a,f=t=>{if(s[t])return!1;let n=e[t*3]-l,r=e[t*3+1]-u,i=e[t*3+2]-d;return n*n+r*r+i*i<=c},p=[],m=i*t+r;for(p.push(r,i),s[m]=1;p.length>0;){let e=p.pop(),r=p.pop(),i=r;for(;i>0&&f(e*t+i-1);)i--;let a=r;for(;a<t-1&&f(e*t+a+1);)a++;for(let n=i;n<=a;n++)s[e*t+n]=1;for(let r of[e-1,e+1]){if(r<0||r>=n)continue;let e=!1;for(let n=i;n<=a;n++){let i=f(r*t+n);i&&!e&&p.push(n,r),e=i}}}return s}function i(e,t,i,a,o){if(!(a.u>=0&&a.u<1&&a.v>=0&&a.v<1))return null;let s=Math.min(t-1,Math.floor(a.u*t)),c=Math.min(i-1,Math.floor(a.v*i)),l=n(e,t,i,s,c),u=r(e,t,i,s,c,l,o),d=new Uint8Array(t*i),f=o*.25+1e-4;for(let n=0;n<i;n++)for(let r=0;r<t;r++){let a=n*t+r;if(u[a]){d[a]=255;continue}if(!(r>0&&u[a-1]===1||r<t-1&&u[a+1]===1||n>0&&u[a-t]===1||n<i-1&&u[a+t]===1))continue;let s=e[a*3]-l[0],c=e[a*3+1]-l[1],p=e[a*3+2]-l[2],m=Math.sqrt(s*s+c*c+p*p);d[a]=Math.round(255*Math.max(0,1-(m-o)/f))}return d}function a(e,t,n,r,i,a){let o=e[n],s=e[n+(i-1)*r],c=0;for(let t=-a;t<=a;t++)c+=t<0?o:t>=i?s:e[n+t*r];let l=1/(2*a+1);for(let u=0;u<i;u++){t[n+u*r]=c*l;let d=u-a,f=u+a+1;c+=(f>=i?s:e[n+f*r])-(d<0?o:e[n+d*r])}}function o(t,n,r,i){let o=new Float32Array(t),s=new Float32Array(t.length);for(let e=0;e<3;e++){for(let e=0;e<r;e++)a(o,s,e*n,1,n,i);for(let e=0;e<n;e++)a(s,o,e,n,r,i)}let c=new Uint8Array(t.length);for(let t=0;t<c.length;t++)c[t]=Math.round(e(o[t],0,255));return c}function s(n,r){let{width:a,height:s}=n,c=new Uint8Array(a*s);if(r.seeds.length===0||a===0||s===0)return c;let l=t(n),u=e(r.tolerance,0,100)/100*.5;for(let e of r.seeds){let t=i(l,a,s,e,u);if(t){if(e.subtract)for(let e=0;e<c.length;e++)c[e]=Math.round(c[e]*(255-t[e])/255);else for(let e=0;e<c.length;e++)t[e]>c[e]&&(c[e]=t[e])}}let d=e(r.feather,0,100)/100*.01*Math.max(a,s);return d<.5?c:o(c,a,s,Math.round(d))}onmessage=({data:e})=>{let{id:t,width:n,height:r,data:i,values:a}=e;try{let e=s({width:n,height:r,data:i},a);postMessage({id:t,coverage:e},{transfer:[e.buffer]})}catch(e){postMessage({id:t,error:e instanceof Error?e.message:String(e)})}}})();\n//# sourceMappingURL=fill-worker-QhW4POtm.js.map", h = typeof self < "u" && self.Blob && new Blob(["(self.URL || self.webkitURL).revokeObjectURL(self.location.href);", m], { type: "text/javascript;charset=utf-8" });
function g(e) {
	let t;
	try {
		if (t = h && (self.URL || self.webkitURL).createObjectURL(h), !t) throw "";
		let n = new Worker(t, { name: e?.name });
		return n.addEventListener("error", () => {
			(self.URL || self.webkitURL).revokeObjectURL(t);
		}), n;
	} catch {
		return new Worker("data:text/javascript;charset=utf-8," + encodeURIComponent(m), { name: e?.name });
	}
}
//#endregion
//#region src/fill-client.ts
var _ = 1;
function v(e) {
	return e.reason ?? new DOMException("The fill was aborted.", "AbortError");
}
function y(e, t, n) {
	return new Promise((r, i) => {
		queueMicrotask(() => {
			if (n.aborted) return i(v(n));
			try {
				let a = f(e, t);
				if (n.aborted) return i(v(n));
				r(a);
			} catch (e) {
				i(e);
			}
		});
	});
}
function b(e, t, n) {
	return n.aborted ? Promise.reject(v(n)) : typeof Worker > "u" ? y(e, t, n) : new Promise((r, i) => {
		let a;
		try {
			a = new g({ name: "Fuzzy Select fill" });
		} catch {
			y(e, t, n).then(r, i);
			return;
		}
		let o = _++, s = () => {
			n.removeEventListener("abort", c), a.terminate();
		}, c = () => {
			s(), i(v(n));
		};
		n.addEventListener("abort", c, { once: !0 }), a.onmessage = ({ data: e }) => {
			e.id === o && (s(), "coverage" in e ? r(e.coverage) : i(Error(e.error)));
		}, a.onerror = (e) => {
			e.preventDefault(), s(), i(Error(e.message || "the fill worker failed"));
		};
		let l = {
			id: o,
			width: e.width,
			height: e.height,
			data: e.data,
			values: t
		};
		a.postMessage(l, { transfer: [e.data.buffer] });
	});
}
//#endregion
//#region src/regions.ts
var x = 2048, S = 1, C = 3, ee = 64;
function w(e) {
	let t = 2166136261;
	for (let n = 0; n < e.length; n++) t ^= e.charCodeAt(n), t = Math.imul(t, 16777619);
	return (t >>> 0).toString(16).padStart(8, "0");
}
function T(e) {
	return w(`${JSON.stringify(e)}|${x}`);
}
function E(e, t) {
	return w(`${JSON.stringify(e)}|${t}|${x}`);
}
var te = new TextEncoder(), ne = new TextDecoder();
function re(e) {
	let t = e.map((e) => [
		e.componentId,
		e.valuesRev,
		e.fullRev
	].map((e) => te.encode(e))), n = C;
	e.forEach((e, r) => {
		n += t[r].reduce((e, t) => e + 2 + t.length, 0) + 8 + e.data.length;
	});
	let r = new Uint8Array(n), i = new DataView(r.buffer);
	r[0] = S, i.setUint16(1, e.length, !0);
	let a = C;
	return e.forEach((e, n) => {
		for (let e of t[n]) i.setUint16(a, e.length, !0), r.set(e, a + 2), a += 2 + e.length;
		i.setUint32(a, e.width, !0), i.setUint32(a + 4, e.height, !0), r.set(e.data, a + 8), a += 8 + e.data.length;
	}), r;
}
function ie(e) {
	if (e.length < C || e[0] !== S) return null;
	let t = new DataView(e.buffer, e.byteOffset, e.byteLength), n = t.getUint16(1, !0);
	if (n > ee) return null;
	let r = [], i = C;
	for (let a = 0; a < n; a++) {
		let n = [];
		for (let r = 0; r < 3; r++) {
			if (i + 2 > e.length) return null;
			let r = t.getUint16(i, !0);
			if (i + 2 + r > e.length) return null;
			n.push(ne.decode(e.subarray(i + 2, i + 2 + r))), i += 2 + r;
		}
		if (i + 8 > e.length) return null;
		let a = t.getUint32(i, !0), o = t.getUint32(i + 4, !0);
		i += 8;
		let s = a * o;
		if (i + s > e.length) return null;
		r.push({
			componentId: n[0],
			valuesRev: n[1],
			fullRev: n[2],
			width: a,
			height: o,
			data: e.slice(i, i + s)
		}), i += s;
	}
	return r;
}
//#endregion
//#region src/coverage.ts
var D = "fuzzy", O = "regions", ae = 8, k = 1e3, A = null, j = null, M = !1, N = 0, P = 0, F = /* @__PURE__ */ new Map(), I = /* @__PURE__ */ new Map(), L = /* @__PURE__ */ new Map(), R = () => `${t.extensionId}.${D}`, z = () => t.stores.useDevelopStore.getState().photoId;
function B(e) {
	let t = /* @__PURE__ */ new Set();
	for (let n of e.masks ?? []) for (let e of n.components) e.extension?.type === R() && t.add(e.id);
	return t;
}
function V(e) {
	return {
		width: e.width,
		height: e.height,
		data: e.data.slice()
	};
}
function H(e) {
	let t = I.get(e);
	t ? I.delete(e) : t = {
		entries: /* @__PURE__ */ new Map(),
		loading: null
	}, I.set(e, t);
	for (let e of I.keys()) {
		if (I.size <= ae) break;
		I.delete(e);
	}
	return t;
}
async function U(e, n) {
	n.loading ??= (async () => {
		try {
			let r = await t.develop.getPhotoData(O, e);
			for (let e of r && ie(r) || []) n.entries.has(e.componentId) || n.entries.set(e.componentId, e);
		} catch {}
	})(), await n.loading;
}
function W(e, n) {
	let r = I.get(e);
	if (!r) return;
	let i = [...r.entries.values()].filter((e) => !n || n.has(e.componentId));
	if (i.length !== 0) try {
		t.develop.putPhotoData(O, re(i), e);
	} catch {}
}
function G(e, n) {
	let r = n ? B(t.stores.useDevelopStore.getState().params) : null, i = L.get(e);
	i && clearTimeout(i.timer);
	let a = setTimeout(() => {
		L.delete(e), W(e, r);
	}, k);
	L.set(e, {
		timer: a,
		keep: r
	});
}
function K() {
	let e = [...L];
	L.clear();
	for (let [t, { timer: n, keep: r }] of e) clearTimeout(n), W(t, r);
}
function q(e, t, n, r) {
	if (r.aborted) return Promise.resolve(null);
	let i = F.get(e);
	if (i && i.rev !== t && (i.controller.abort(), F.delete(e), i = void 0), !i) {
		let r = new AbortController(), a = {
			rev: t,
			controller: r,
			waiters: 0,
			promise: Promise.resolve(null)
		};
		a.promise = n(r.signal).catch(() => null).then((t) => (F.get(e) === a && F.delete(e), r.signal.aborted ? null : t)), F.set(e, a), i = a;
	}
	let a = i;
	return a.waiters++, new Promise((e) => {
		let t = () => {
			--a.waiters === 0 && a.controller.abort(), e(null);
		};
		r.addEventListener("abort", t, { once: !0 }), a.promise.then((n) => {
			r.removeEventListener("abort", t), e(r.aborted ? null : n);
		});
	});
}
function J(e) {
	return `${e.inputKey ?? ""}${e.finalSource === !1 ? "|preview" : ""}`;
}
function Y() {
	A = null, j = null, N++;
}
async function oe(e, n) {
	try {
		let r = await t.develop.captureFloatFrame(t.stores.useDevelopStore.getState().params, {
			point: "mask",
			maxEdge: x
		});
		if (!r) return M = !0, null;
		let i = {
			photoId: e,
			frame: r,
			inputKey: J(r)
		};
		return n === N && (A = i), i;
	} catch {
		return null;
	}
}
function se(e) {
	if (A?.photoId === e) return Promise.resolve(A);
	if (j?.photoId === e) return j.promise;
	let t = oe(e, N).finally(() => {
		j?.promise === t && (j = null);
	});
	return j = {
		photoId: e,
		promise: t
	}, t;
}
async function X(e, t, n) {
	return b({
		width: e.width,
		height: e.height,
		data: new Float32Array(e.data)
	}, t, n);
}
function Z(e, t, n) {
	H(e).entries.set(t.componentId, t), G(e, n);
}
async function ce(e, n) {
	let { photoId: r, componentId: i, signal: a } = e, o = H(r);
	await U(r, o);
	let s = A?.photoId === r ? A.inputKey : await t.develop.maskInputKey() ?? "";
	if (a.aborted || z() !== r) return null;
	let c = E(n, s), l = o.entries.get(i);
	return l?.fullRev === c ? V(l) : q(`${r}/${i}`, c, async (e) => {
		let t = await se(r);
		if (!t || e.aborted || z() !== r) return null;
		let a = await X(t.frame, n, e);
		if (e.aborted) return null;
		let o = {
			componentId: i,
			valuesRev: T(n),
			fullRev: E(n, t.inputKey),
			width: t.frame.width,
			height: t.frame.height,
			data: a
		};
		return Z(r, o, !0), V(o);
	}, a);
}
async function le(e, n) {
	let { photoId: r, componentId: i, signal: a } = e, o = H(r);
	await U(r, o);
	let s = T(n), c = o.entries.get(i);
	return c?.valuesRev === s ? V(c) : q(`${r}/${i}`, s, async (e) => {
		let a = await t.catalog.getEditState(r), o = a?.stack[a.currentIndex];
		if (!o || e.aborted) return null;
		let c = await t.develop.renderPhotoFloatFrame(r, o.params, {
			point: "mask",
			maxEdge: x,
			...o.paramBag ? { paramBag: o.paramBag } : {}
		});
		if (!c || e.aborted) return null;
		let l = await X(c, n, e);
		if (e.aborted) return null;
		let u = {
			componentId: i,
			valuesRev: s,
			fullRev: E(n, J(c)),
			width: c.width,
			height: c.height,
			data: l
		};
		return Z(r, u, !1), V(u);
	}, a);
}
async function Q(e) {
	try {
		if (e.signal.aborted) return null;
		let t = a(e.values);
		return t.seeds.length === 0 ? null : z() === e.photoId ? await ce(e, t) : await le(e, t);
	} catch {
		return null;
	}
}
async function ue(e, n) {
	if (B(n).size === 0) return;
	let r = ++P, i = await t.develop.maskInputKey();
	if (r !== P || z() !== e) return;
	let a = A?.photoId === e && (i !== A.inputKey || A.frame.finalSource === !1);
	a && Y(), (a || M) && (M = !1, t.develop.refreshMaskCoverage(D));
}
function de() {
	return t.stores.useDevelopStore.subscribe((e, t) => {
		if (e.photoId !== t.photoId) {
			K(), Y(), M = !1;
			return;
		}
		if (e.photoId === null) return;
		let n = e.history !== t.history || e.historyIndex !== t.historyIndex, r = e.sourceSize !== t.sourceSize && (M || A?.frame.finalSource === !1);
		(n || r) && ue(e.photoId, e.params);
	});
}
function fe() {
	K();
	for (let e of F.values()) e.controller.abort();
	F.clear(), I.clear(), Y(), M = !1, P++;
}
//#endregion
//#region src/index.tsx
var $ = null;
function pe(e) {
	n(e), e.develop.registerMaskComponentKind({
		name: D,
		label: "Fuzzy Select",
		icon: "✦",
		commitLabel: "Fuzzy Select Point",
		create: () => ({
			seeds: [],
			tolerance: 15,
			feather: 10
		}),
		onPoint: (e, t) => {
			let n = a(e);
			if (n.seeds.length >= 64) return null;
			let r = t.alt ? {
				u: t.u,
				v: t.v,
				subtract: !0
			} : {
				u: t.u,
				v: t.v
			};
			return {
				...n,
				seeds: [...n.seeds, r]
			};
		},
		markers: (e) => a(e).seeds,
		Controls: p,
		coverage: Q
	}), $ = de();
}
function me() {
	$?.(), $ = null, fe(), t?.develop.unregisterMaskComponentKind(D);
}
//#endregion
export { pe as activate, me as deactivate };

//# sourceMappingURL=index.js.map