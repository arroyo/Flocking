var flock = flock || {};

(function () {
    flock.tests = function () {
        var simpleGraph = {
            ugen: "flock.ugen.out",
            inputs: {
                source: {
                    id: "sine",
                    ugen: "flock.ugen.sinOsc",
                    inputs: {
                        freq: 440,
                        mul: {
                            id: "mod",
                            ugen: "flock.ugen.sinOsc",
                            inputs: {
                                freq: 1.0
                            }
                        }
                    }
                }
            }
        };
        
        var createSynth = function (graph) {
            return flock.synth(graph || simpleGraph, 1, 1);
        };
        
        var countKeys = function (obj) {
            var numKeys = 0,
                key;
            for (key in obj) {
                numKeys++;
            }
            return numKeys;
        };
        
        var countNonZeroSamples = function (buffer) {
            var numNonZero = 0;
            for (var i = 0; i < buffer.length; i++) {
                var samp = buffer[i];
                numNonZero = (samp > 0.0) ? numNonZero + 1 : numNonZero;
            }
            return numNonZero;
        };
        
        var checkSampleBoundary = function (buffer, min, max) {
            var aboveMin = true,
                belowMax = true;
                
            for (var i = 0; i < buffer.length; i++) {
                var samp = buffer[i];
                aboveMin = (samp >= min);
                belowMax = (samp <= max);
            }
            
            ok(aboveMin, "No samples in the buffer should go below " + min);
            ok(belowMax, "No samples in the buffer should exceed " + max);
        };
        
        
        module("Utility tests");
        
        test("flock.minBufferSize()", function () {
            var minSize = flock.minBufferSize(44100, 2, 500);
            equals(minSize, 44100, 
                "The mininum buffer size for a 44100 KHz stereo signal with 500ms latency should be 44100");
            minSize = flock.minBufferSize(44100, 1, 500);
            equals(minSize, 22050, 
                "The mininum buffer size for a 44100 KHz mono signal with 500ms latency should be 22050");
            minSize = flock.minBufferSize(48000, 2, 250);
            equals(minSize, 24000, 
                "The mininum buffer size for a 48000 KHz stereo signal with 250ms latency should be 24000");
                
        });
        
        module("Synth tests");
        
        test("Get input values", function () {
            var synth = createSynth();
            
            expect(5);
            
            // Getting simple values.
            equals(synth.input("sine.freq"), 440, "Getting 'sine.freq' should return the value set in the synth graph.");
            equals(synth.input("sine.freq"), 440, "Getting 'sine.freq' a second time should return the same value.");
            equals(synth.input("mod.freq"), 1.0, "Getting 'carrier.freq' should also return the initial value.");
            
            // Get a ugen.
            var ugen = synth.input("mod");
            ok(ugen.audio, "A ugen returned from synth.input() should have an audio property...");
            equals(typeof(ugen.audio), "function", "...of type function");
        });
        
        test("Set input values", function () {
            var synth = createSynth(),
                sineUGen = synth.ugens.sine,
                modUGen = synth.ugens.mod;
            
            // Setting simple values.
            synth.input("sine.freq", 220);
            equals(synth.input("sine.freq"), 220, "Setting 'sine.freq' should update the input value accordingly.");
            equals(sineUGen.inputs.freq.source.model.value, 220, "And the underlying value ugen should also be updated.");
            synth.input("sine.freq", 110);
            equals(synth.input("sine.freq"), 110, "Setting 'sine.freq' a second time should also work.");
            equals(sineUGen.inputs.freq.source.model.value, 110, "And the underlying value ugen should also be updated.");
            synth.input("mod.freq", 2.0);
            equals(synth.input("mod.freq"), 2.0, "Setting 'mod.freq' should update the input value.");
            equals(modUGen.inputs.freq.source.model.value, 2.0, "And the underlying value ugen should also be updated.");
            equals(modUGen.inputs.freq.source.buffer[0], 2.0, "Even the ugen's buffer should contain the new value.");
            
            // TODO: Set a ugen.
            var testUGen = flock.ugen.value({value: 8.0}, null, 1);
            var wire = synth.input("sine.mul", testUGen);
            equals(synth.ugens.sine.inputs.mul.source, testUGen, "The 'sine' ugen should be set to our test ugen.");
            equals(wire.source, testUGen, "The wire returned from setting a ugen should have the correct source.");
        });


        module("Parsing tests");
        
        test("flock.parse.graph()", function () {
            var testGraph = {
                ugen: "flock.ugen.out",
                inputs: {
                    source: {
                        id: "sine",
                        ugen: "flock.ugen.sinOsc",
                        inputs: {
                            freq: 440,
                            mul: {
                                id: "mul",
                                ugen: "flock.ugen.value",
                                inputs: {
                                    value: 1.0
                                }
                            }
                        }
                    }
                }
            };
            var parsedUGens = flock.parse.graph(testGraph, 1, 1);
                      
            equals(countKeys(parsedUGens), 3, "There should be three named ugens.");            
            ok(parsedUGens[flock.OUT_UGEN_ID], "The output ugen should be at the reserved key flock.OUT_UGEN_ID.");
            
            ok(parsedUGens.sine, "The sine ugen should be keyed by its id....");
            ok(parsedUGens.sine.wavetable, "...and it should be a real sine ugen.");
            
            ok(parsedUGens.mul, "The mul ugen should be keyed by its id...");
            ok(parsedUGens.mul.model.value, "...and it should be a real value ugen.");
        });


        module("UGen tests");

        var checkDensity = function (dust, density) {
            // Run the algorithm 100x and average the results.
            var nonZeroSum = 0;
            var numRuns = 1500;
            for (var i = 0; i < numRuns; i++) {
                buffer = dust.audio(44100);
                nonZeroSum += countNonZeroSamples(buffer);
            }
            var avgNumNonZeroSamples = nonZeroSum / numRuns;
            equals(Math.round(avgNumNonZeroSamples), density, 
                "There should be roughly" + density + " non-zero samples in a one-second buffer.");
        };
        
        test("flock.ugen.dust", function () {
            var density = 1.0;
            var dust = flock.ugen.dust({
                density: flock.wire(density, 44100)
            }, new Float32Array(44100), 44100);
            var buffer = dust.audio(44100);
            
            // Check basic details about the buffer: it should be the correct length,
            // and never contain values above 1.0.
            ok(buffer, "A buffer should be returned from dust.audio()");
            equals(buffer.length, 44100, "And it should be the specified length.");
            checkSampleBoundary(buffer, 0.0, 1.0);
            
            // Check that the buffer contains an avg. density of 1.0 non-zero samples per second.
            checkDensity(dust, density);

            // And now try a density of 200.
            density = 200;
            dust.inputs.density = flock.wire(density, 44100);
            checkDensity(dust, density); 
        });
        
        test("flock.ugen.out mono input", function () {
            // Test with a single mono input buffer.
            var mockBuffer = [
                1, 2, 3, 4, 5,
                6, 7, 8, 9, 10,
                11, 12, 13, 14, 15,
                16, 17, 18, 19, 20
            ];
            
            var monoWire = {
                pull: function (numSamps) {
                    return mockBuffer;
                }
            };
            var out = flock.ugen.out({source: monoWire}, [], 44100);
            var expected = [
                1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 
                6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 
                12, 12, 13, 13, 14, 14, 15, 15, 16, 16,
                17, 17, 18, 18, 19, 19, 20, 20
            ];
            
            // Pull the whole buffer.
            var actual = out.audio(20);
            equals(actual.length, 40, "The output buffer should be twice the size of the input buffer.");
            deepEqual(actual, expected, 
                "We should receive a stereo buffer containing two copies of the original input buffer.");
            
            
            // Pull a partial buffer.
            expected = [
                1, 1, 2, 2, 3, 3, 4, 4, 5, 5,
                6, 6, 7, 7, 8, 8, 9, 9, 10, 10
            ];
            out.output = []; // Reset the output buffer so we don't get any spare stuff floating in it.
            actual = out.audio(10);
            equals(actual.length, 20, "The output buffer should be 20 samples long.");
            deepEqual(actual, expected,
                "We should receive a stereo buffer containing two copies of the first 10 items in the input buffer.");
        });
        
        test("flock.ugen.out stereo input", function () {
            // Test with two input buffers.
            var mockLeft = [
                1, 2, 3, 4, 5,
                6, 7, 8, 9, 10,
                11, 12, 13, 14, 15,
                16, 17, 18, 19, 20
            ];
            
            var mockRight = [
                20, 19, 18, 17, 16,
                15, 14, 13, 12, 11,
                10, 9, 8, 7, 6, 
                5, 4, 3, 2, 1
            ];
            
            var stereoWire = {
                pull: function (numSamps) {
                    return [mockLeft, mockRight];
                }
            };
            var out = flock.ugen.out({source: stereoWire}, [], 44100);
            var expected = [
                1, 20, 2, 19, 3, 18, 4, 17, 5, 16, 
                6, 15, 7, 14, 8, 13, 9, 12, 10, 11, 11, 10, 
                12, 9, 13, 8, 14, 7, 15, 6, 16, 5,
                17, 4, 18, 3, 19, 2, 20, 1
            ];
            
            // Pull the whole buffer. Expect a stereo interleaved buffer as the result, 
            // containing two copies of the original input buffer.
            var actual = out.audio(20);
            equals(actual.length, 40, "The output buffer should be twice the size of the input buffer.");
            deepEqual(actual, expected, "We should receive a stereo buffer, with each buffer interleaved.");
        });
        
        test("flock.ugen.out.audio() with offset", function () {
            // Test with a single mono input buffer.
            var mockBuffer = [
                1, 2, 3, 4, 5,
                6, 7, 8, 9, 10,
                11, 12, 13, 14, 15,
                16, 17, 18, 19, 20
            ];
            
            var monoWire = {
                pull: function (numSamps) {
                    return mockBuffer;
                }
            };
            var out = flock.ugen.out({source: monoWire}, [], 44100);
            
            var expectedFirst = [1, 1, 2, 2];
            expectedSecond = [1, 1, 2, 2, 1, 1, 2, 2];
            expectedThird = [1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2, 3, 3];
            
            var actual = out.audio(2, 0);
            equals(actual.length, 4, "At the first control period, ",
                "the output buffer should be twice the size of the input buffer.");
            deepEqual(actual, expectedFirst, 
                "At the first control period, ",
                " the output buffer should contain interleaved copies of the first two items, ",
                "at the first four index slots.");
            
            actual = out.audio(2, 2);
            equals(actual.length, 8, "At the second control period, the output buffer contain 8 items.");
            deepEqual(actual, expectedSecond, 
                "At the second control period...");
            
            actual = out.audio(3, 4);
            equals(actual.length, 14, "At the third control period, the output buffer should contain 14 items");
            deepEqual(actual, expectedSecond, "At the third control period...");
        });
    };
})();