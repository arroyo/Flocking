/*!
* polyDataView, a better polyfill for DataView.
* http://github.com/colinbdclark/polyDataView
*
* Copyright 2012, Colin Clark
* Dual licensed under the MIT and GPL Version 2 licenses.
*/

/*global window, ArrayBuffer, Uint8Array, Uint32Array*/
/*jslint bitwise: true, vars: true, white: true, plusplus: true, maxerr: 50, indent: 4 */

(function () {
    "use strict";

    var nativeDataView = typeof (window.DataView) !== "undefined" ? window.DataView : undefined; 
    
    var isHostLittleEndian = (function () {
        var endianTest = new ArrayBuffer(4),
            u8View = new Uint8Array(endianTest),
            u32View = new Uint32Array(endianTest);
            
        u8View[0] = 0x01;
        u8View[1] = 0x02;
        u8View[2] = 0x03;
        u8View[3] = 0x04;

        return u32View[0] === 0x04030201;
    }());
    
    
    var addSharedMethods = function (that) {
        
        that.getString = function (len, w, o, isLittle) {
            var s = "",
                i,
                c;
                
            for (i = 0; i < len; i++) {
                c = that.getUint(w, o, isLittle);
                if (c > 0xFFFF) {
                    c -= 0x10000;
                    s += String.fromCharCode(0xD800 + (c >> 10), 0xDC00 + (c & 0x3FF));
                }  else {
                    s += String.fromCharCode(c);
                }
            }
            
            return s;
        };

        that.getFloat80 = function (o, isLittle) {
            o = typeof (o) === "number" ? o : that.offset;
            
            // This method is a modified version of Joe Turner's implementation of an "extended" float decoder,
            // originally licensed under the WTF license. https://github.com/oampo/audiofile.js/blob/master/audiofile.js
            var expon = that.getUint(2, o, isLittle), 
                hi = that.getUint(4, o + 2),
                lo = that.getUint(4, o + 6),
                rng = 1 << (16 - 1), 
                sign = 1,
                value;
                
            if (expon >= rng) {
                expon |= ~(rng - 1);
            }

            if (expon < 0) {
                sign = -1;
                expon += rng;
            }

            if (expon === hi === lo === 0) {
                value = 0;
            } else if (expon === 0x7FFF) {
                value = Number.MAX_VALUE;
            } else {
                expon -= 16383;
                value = (hi * 0x100000000 + lo) * Math.pow(2, expon - 63);
            }
            
            that.offset = o + 10;
            
            return sign * value;
        }; 
    };
    
    var polyDataView = function (buffer, offset, length) {
        var that = {
            buffer: buffer,
            offset: typeof(offset) === "number" ? offset : 0,
            u8Buf: new Uint8Array(buffer, offset, length),
            quickArray: []
        };
        that.length = that.u8Buf.length;
        
        that.getUints = function (len, w, o, isLittle, array) {
            // TODO: Complete cut and paste job from getInts()!
            o = typeof (o) === "number" ? o : that.offset;
            that.offset = o + (len * w);
            var arrayType = window["Uint" + (w * 8) + "Array"];
            
            if (len > 1 && isHostLittleEndian === isLittle) {
                return new arrayType(that.buffer, o, len);
            }
            
            array = array || new arrayType(len);
            var byteStart, 
                idxInc,
                i,
                idx,
                n,
                j,
                scale,
                v;

            if (isLittle) {
                byteStart = 0;
                idxInc = 1;
            } else {
                byteStart = w - 1;
                idxInc = -1;
            }
            
            for (i = 0; i < len; i++) {
                idx = o + (i * w) + byteStart;
                n = 0;
                for (j = 0, scale = 1; j < w; j++, scale *= 256) {
                    v = that.u8Buf[idx];
                    n += v * scale;
                    idx += idxInc;
                }
                array[i] = n;
            }
            
            return array;
        };
        
        that.getInts = function (len, w, o, isLittle, array) {
            o = typeof (o) === "number" ? o : that.offset;
            that.offset = o + (len * w);
            var arrayType = window["Int" + (w * 8) + "Array"];
                        
            // If the host's endianness matches the file's, just use a typed array view directly.
            if (len > 1 && isHostLittleEndian === isLittle) {
                return new arrayType(that.buffer, o, len);
            }
            
            array = array || new arrayType(len);
            var mask = Math.pow(256, w),
                halfMask = (mask / 2) - 1,
                byteStart, 
                idxInc,
                i,
                idx,
                n,
                j,
                scale,
                v;

            if (isLittle) {
                byteStart = 0;
                idxInc = 1;
            } else {
                byteStart = w - 1;
                idxInc = -1;
            }
            
            for (i = 0; i < len; i++) {
                idx = o + (i * w) + byteStart;
                n = 0;
                for (j = 0, scale = 1; j < w; j++, scale *= 256) {
                    v = that.u8Buf[idx];
                    n += v * scale;
                    idx += idxInc;
                }
                array[i] = n > halfMask ? n - mask : n;
            }
            
            return array;
        };
        
        that.getFloats = function (len, w, o, isLittle, array) {
            var bits = w * 8,
                getterName = "getFloat" + bits,
                arrayType = window["Float" + bits + "Array"],
                i;
            
            // If the host's endianness matches the file's, just use a typed array view directly.
            if (len > 1 && isHostLittleEndian === isLittle) {
                o = typeof (o) === "number" ? o : that.offset;
                that.offset = o + (len * w);
                return new arrayType(that.buffer, o, len);
            }
            
            array = array || new arrayType(len);
            
            for (i = 0; i < len; i++) {
                array[i] = that[getterName](o, isLittle);
            }
            
            return array;
        };
        
        that.getUint = function (w, o, isLittle) {
            return w === 1 ? that.getUint8(o, isLittle) : that.getUints(1, w, o, isLittle, that.quickArray)[0];
        };
        
        that.getInt = function (w, o, isLittle) {
            return that.getInts(1, w, o, isLittle, that.quickArray)[0];
        };
         
        that.getUint8 = function (o) {
            o = typeof (o) === "number" ? o : that.offset;
            
            var n = that.u8Buf[o];
            that.offset = o + 1;
            
            return n;
        };
        
        that.getInt8 = function (o, isLittle) {
            return that.getInts(1, 1, o, isLittle, that.quickArray)[0];            
        };
        
        that.getUint16 = function (o, isLittle) {
            return that.getUints(1, 2, o, isLittle, that.quickArray)[0];            
        };
        
        that.getInt16 = function (o, isLittle) {
            return that.getInts(1, 2, o, isLittle, that.quickArray)[0];            
        };
        
        that.getUint32 = function (o, isLittle) {
            return that.getUints(1, 4, o, isLittle, that.quickArray)[0];
        };
        
        that.getInt32 = function (o, isLittle) {
            return that.getInts(1, 4, o, isLittle, that.quickArray)[0];            
        };
        
        that.getFloat32 = function (o, isLittle) {
            // This method is a modified version of Christopher Chedeau's float decoding implementation from jDataView,
            // originally distributed under the WTF license. https://github.com/vjeux/jDataView
            var bytes = that.getUints(4, 1, o, isLittle),
                b0, b1, b2, b3,
                sign,
                exp,
                mant;
            
            if (isLittle) {
                b0 = bytes[3];
                b1 = bytes[2];
                b2 = bytes[1];
                b3 = bytes[0];
            } else {
                b0 = bytes[0];
                b1 = bytes[1];
                b2 = bytes[2];
                b3 = bytes[3];
            }
                
            sign = 1 - (2 * (b0 >> 7));
            exp = (((b0 << 1) & 255) | (b1 >> 7)) - 127;
            mant = ((b1 & 127) * 65536) | (b2 * 256) | b3;
            
            if (exp === 128) {
                return mant !== 0 ? NaN : sign * Infinity;
            }
            
            if (exp === -127) {
                return sign * mant * 1.401298464324817e-45;
            }
            
            return sign * (1 + mant * 1.1920928955078125e-7) * Math.pow(2, exp);
        };
        
        that.getFloat64 = function (o, isLittle) {
            // This method is a modified version of Christopher Chedeau's float decoding implementation from jDataView,
            // originally distributed under the WTF license. https://github.com/vjeux/jDataView
            var bytes = that.getUints(8, 1, o, isLittle),
                b0, b1, b2, b3, b4, b5, b6, b7,
                sign,
                exp,
                mant;
            
            if (isLittle) {
                b0 = bytes[7];
                b1 = bytes[6];
                b2 = bytes[5];
                b3 = bytes[4];
                b4 = bytes[3];
                b5 = bytes[2];
                b6 = bytes[1];
                b7 = bytes[0];
            } else {
                b0 = bytes[0];
                b1 = bytes[1];
                b2 = bytes[2];
                b3 = bytes[3];
                b4 = bytes[4];
                b5 = bytes[5];
                b6 = bytes[6];
                b7 = bytes[7];
            }
            
            sign = 1 - (2 * (b0 >> 7));
            exp = ((((b0 << 1) & 255) << 3) | (b1 >> 4)) - 1023;
            mant = ((b1 & 15) * 281474976710656) + (b2 * 1099511627776) + (b3 * 4294967296) + 
                (b4 * 16777216) + (b5 * 65536) + (b6 * 256) + b7;
                                
            if (exp === 1024) {
                return mant !== 0 ? NaN : sign * Infinity;
            }

            if (exp === -1023) {
                return sign * mant * 5e-324;
            }

            return sign * (1 + mant * 2.220446049250313e-16) * Math.pow(2, exp);
        };
        
        addSharedMethods(that);
        return that;
    };
    
    var wrappedDataView = function (buffer, offset, length) {
        var that = {
            buffer: buffer,
            offset: typeof(offset) === "number" ? offset : 0,
            dv: new nativeDataView(buffer, offset, length),
            length: new Uint8Array(buffer).length
        };
                
        that.getUint = function (w, o, isLittle) {
            o = typeof (o) === "number" ? o : that.offset;
            
            var n = that.dv["getUint" + (w * 8)](o, isLittle);
            that.offset = o + w;
            
            return n;
        };
        
        that.getInt = function (w, o, isLittle) {
            o = typeof (o) === "number" ? o : that.offset;

            var n = that.dv["getInt" + (w * 8)](o, isLittle);
            that.offset = o + w;
            
            return n;  
        };
        
        var getBytes = function (type, len, w, o, isLittle, array) {
            var bits = (w * 8),
                typeSize = type + bits,
                dv = that.dv,
                getterName = "get" + typeSize,
                i;
                
            array = array || new window[typeSize + "Array"](len);
            o = typeof (o) === "number" ? o : that.offset;
            
            for (i = 0; i < len; i++) {
                array[i] = dv[getterName](o, isLittle);
                o += w;
            }
            
            that.offset = o;

            return array;
        };
        
        that.getUints = function (len, w, o, isLittle, array) {
            return getBytes("Uint", len, w, o, isLittle, array);
        };
        
        that.getInts = function (len, w, o, isLittle, array) {
            return getBytes("Int", len, w, o, isLittle, array);
        };
        
        that.getFloats = function (len, w, o, isLittle, array) {
            return getBytes("Float", len, w, o, isLittle, array);
        };
        
        that.getUint8 = function (o) {
            o = typeof (o) === "number" ? o : that.offset;
            
            var n = that.dv.getUint8(o);
            that.offset = o + 1;
            
            return n;
        };
        
        that.getInt8 = function (o) {
            o = typeof (o) === "number" ? o : that.offset;
            
            var n = that.dv.getInt8(o);
            that.offset = o + 1;
            
            return n;
        };
        
        that.getUint16 = function (o, isLittle) {
            o = typeof (o) === "number" ? o : that.offset;
            
            var n = that.dv.getUint16(o, isLittle);
            that.offset = o + 2;
            
            return n;            
        };
        
        that.getInt16 = function (o, isLittle) {
            o = typeof (o) === "number" ? o : that.offset;
            
            var n = that.dv.getInt16(o, isLittle);
            that.offset = o + 2;
            
            return n;
        };
        
        that.getUint32 = function (o, isLittle) {
            o = typeof (o) === "number" ? o : that.offset;
            
            var n = that.dv.getUint32(o, isLittle);
            that.offset = o + 4;
            
            return n;
        };
        
        that.getInt32 = function (o, isLittle) {
            o = typeof (o) === "number" ? o : that.offset;
            
            var n = that.dv.getInt32(o, isLittle);
            that.offset = o + 4;
            
            return n;            
        };
        
        that.getFloat32 = function (o, isLittle) {
            o = typeof (o) === "number" ? o : that.offset;
            
            var n = that.dv.getFloat32(o, isLittle);
            that.offset = o + 4;
            
            return n;
        };
        
        that.getFloat64 = function (o, isLittle) {
            o = typeof (o) === "number" ? o : that.offset;
            
            var n = that.dv.getFloat64(o, isLittle);
            that.offset = o + 8;
            
            return n;
        };
        
        addSharedMethods(that);
        return that;
    };
    
    window.polyDataView = nativeDataView ? wrappedDataView : polyDataView;
}());
