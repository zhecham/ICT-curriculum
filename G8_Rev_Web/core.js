/* Shared scoring and progress rules. No user answer is ever executed. */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RevisionCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SCHEMA = "revision-lab-progress";
  var VERSION = 1;
  var MAX_TEXT = 4096;
  var EXAM_MS = 60 * 60 * 1000;
  var own = function (object, name) {
    return Object.prototype.hasOwnProperty.call(object, name);
  };
  var record = function (value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    var proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  };
  var safeName = function (name) {
    return typeof name === "string" && name.length > 0 &&
      name !== "__proto__" && name !== "constructor" && name !== "prototype";
  };
  var finite = function (value) {
    return typeof value === "number" && Number.isFinite(value);
  };
  var integer = function (value, min, max, fallback) {
    return finite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;
  };
  var timestamp = function (value, fallback) {
    return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
  };
  var REHEARSAL_MARKS = 50;

  // Convert a previously saved opaque key without publishing a mapping table.
  function neutralId(grade, value) {
    var hash = 2166136261;
    for (var i = 0; i < value.length; i += 1) {
      hash = Math.imul(hash ^ value.charCodeAt(i), 16777619) >>> 0;
    }
    return "g" + grade + "-p" + hash.toString(16).padStart(8, "0");
  }

  function savedId(value, grade, knownIds) {
    if (typeof value !== "string" || !safeName(value)) return null;
    if (knownIds.has(value)) return value;
    var migrated = neutralId(grade, value);
    return knownIds.has(migrated) ? migrated : null;
  }

  /*
   * A small lexer, not a Python evaluator. Token boundaries are retained so
   * "not flag" cannot collapse into "notflag", or "= =" into "==".
   * String values keep their contents and case; only their quote style changes.
   */
  function pythonTokens(value) {
    if (typeof value !== "string" || value.length > MAX_TEXT || !value.trim()) return null;
    var source = value.trim();
    var tokens = [];
    var brackets = [];
    var i = 0;
    var escapes = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", a: "\u0007" };
    var pairs = { ")": "(", "]": "[", "}": "{" };
    var operators = [
      "**=", "//=", "<<=", ">>=", "==", "!=", "<=", ">=", "+=", "-=", "*=",
      "/=", "%=", "**", "//", "<<", ">>", "<-", "->", ":=",
      "+", "-", "*", "/", "%", "<", ">", "=", "(", ")", "[", "]", "{", "}",
      ",", ":", ".", "&", "|", "^", "~"
    ];
    while (i < source.length) {
      var ch = source[i];
      if (/\s/.test(ch)) { i += 1; continue; }
      if (ch === "'" || ch === '"') {
        var quote = ch;
        var triple = source.slice(i, i + 3) === quote.repeat(3);
        var delimiter = triple ? quote.repeat(3) : quote;
        var text = "";
        var closed = false;
        i += delimiter.length;
        while (i < source.length) {
          if (source.slice(i, i + delimiter.length) === delimiter) {
            i += delimiter.length;
            closed = true;
            break;
          }
          ch = source[i++];
          if (!triple && (ch === "\n" || ch === "\r")) return null;
          if (ch !== "\\") { text += ch; continue; }
          if (i >= source.length) return null;
          var next = source[i++];
          if (next === "\n") continue;
          if (next === "\r") {
            if (source[i] === "\n") i += 1;
            continue;
          }
          if (next === "\\" || next === "'" || next === '"') { text += next; continue; }
          if (own(escapes, next)) { text += escapes[next]; continue; }
          if (next === "x" || next === "u" || next === "U") {
            var length = next === "x" ? 2 : next === "u" ? 4 : 8;
            var hex = source.slice(i, i + length);
            if (hex.length !== length || !/^[0-9a-f]+$/i.test(hex)) return null;
            var point = parseInt(hex, 16);
            if (point > 0x10ffff) return null;
            text += String.fromCodePoint(point);
            i += length;
            continue;
          }
          if (/[0-7]/.test(next)) {
            var octal = next;
            while (octal.length < 3 && i < source.length && /[0-7]/.test(source[i])) {
              octal += source[i++];
            }
            text += String.fromCodePoint(parseInt(octal, 8));
            continue;
          }
          // Named escapes need a Unicode name database; do not guess their value.
          if (next === "N") return null;
          // Python preserves an unrecognised escape's backslash.
          text += "\\" + next;
        }
        if (!closed) return null;
        tokens.push(["string", text]);
        continue;
      }
      var name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i));
      if (name) {
        tokens.push(["name", name[0]]);
        i += name[0].length;
        continue;
      }
      var number = /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/.exec(source.slice(i));
      if (number) {
        tokens.push(["number", number[0]]);
        i += number[0].length;
        continue;
      }
      var aliases = { "\u2265": ">=", "\u2264": "<=", "\u2260": "!=", "\u2190": "<-" };
      var op = own(aliases, ch) ? aliases[ch] : null;
      var consumed = op ? 1 : 0;
      if (!op) {
        for (var o = 0; o < operators.length; o += 1) {
          if (source.slice(i, i + operators[o].length) === operators[o]) {
            op = operators[o];
            consumed = op.length;
            break;
          }
        }
      }
      if (!op) return null;
      if (op === "(" || op === "[" || op === "{") brackets.push(op);
      if (own(pairs, op) && brackets.pop() !== pairs[op]) return null;
      tokens.push(["operator", op]);
      i += consumed;
    }
    return brackets.length || !tokens.length ? null : tokens;
  }

  function normalize(value, mode) {
    if (mode === "number" && finite(value)) value = String(value);
    if (typeof value !== "string" || value.length > MAX_TEXT) return null;
    var text = value.trim();
    if (!text) return null;
    if (mode === "number") {
      if (!/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(text)) return null;
      var number = Number(text);
      return Number.isFinite(number) ? String(Object.is(number, -0) ? 0 : number) : null;
    }
    if (mode === "binary") {
      text = text.replace(/\s+/g, "");
      // Never convert this to Number: leading zeros are part of the answer.
      return /^[01]+$/.test(text) ? text : null;
    }
    if (mode === "hex") {
      if (!/^(?:0x)?[0-9a-f]+$/i.test(text)) return null;
      text = text.replace(/^0x/i, "").toUpperCase();
      return text.replace(/^0+(?=.)/, "");
    }
    if (mode === "python") {
      var tokens = pythonTokens(text);
      if (!tokens) return null;
      var last = tokens[tokens.length - 1];
      if (last[0] === "operator" && last[1] === ":") tokens = tokens.slice(0, -1);
      return tokens.length ? JSON.stringify(tokens) : null;
    }
    if (mode === "text" || mode === undefined || mode === null) {
      // Ordinary short-answer text is case tolerant; spacing inside it matters.
      return text.toLocaleLowerCase("en");
    }
    return null;
  }

  function literalInputCall(value) {
    var tokens = pythonTokens(value);
    if (!tokens || (tokens.length !== 3 && tokens.length !== 4)) return false;
    if (tokens[0][0] !== "name" || tokens[0][1] !== "input") return false;
    if (tokens[1][0] !== "operator" || tokens[1][1] !== "(") return false;
    var end = tokens[tokens.length - 1];
    if (end[0] !== "operator" || end[1] !== ")") return false;
    return tokens.length === 3 || tokens[2][0] === "string";
  }

  function choiceIndex(value, count) {
    if (typeof value === "string" && /^[0-9]+$/.test(value.trim())) value = Number(value.trim());
    return Number.isInteger(value) && value >= 0 && value < count ? value : null;
  }

  function validOrder(value, count) {
    return Array.isArray(value) && value.length === count &&
      value.every(function (item) { return Number.isInteger(item) && item >= 0 && item < count; }) &&
      new Set(value).size === count;
  }

  function checkWidget(widget, value) {
    if (!record(widget)) return false;
    if (widget.type === "choice") {
      if (!Array.isArray(widget.options) || !Number.isInteger(widget.answer)) return false;
      var index = choiceIndex(value, widget.options.length);
      return index !== null && index === widget.answer;
    }
    if (widget.type === "order") {
      if (!Array.isArray(widget.items) || !validOrder(widget.answer, widget.items.length) ||
          !validOrder(value, widget.items.length)) return false;
      return value.every(function (item, i) { return item === widget.answer[i]; });
    }
    if (widget.type !== "text") return false;
    var accepted = [widget.answer].concat(Array.isArray(widget.accept) ? widget.accept : []);
    if (widget.normalize === "python" && accepted.some(literalInputCall)) {
      // An arbitrary ordinary string prompt is allowed, but not a cast,
      // expression, variable, extra argument or nested function call.
      return literalInputCall(value);
    }
    var actual = normalize(value, widget.normalize);
    if (actual === null) return false;
    return accepted.some(function (answer) {
      var canonical = normalize(answer, widget.normalize);
      return canonical !== null && actual === canonical;
    });
  }

  function key(part, widget) {
    return part.id + "::" + widget.id;
  }

  function scoreQuestion(question, answers) {
    answers = record(answers) ? answers : {};
    var result = { score: 0, max: 0, fields: {} };
    question.parts.forEach(function (part) {
      part.widgets.forEach(function (widget) {
        var name = key(part, widget);
        var correct = checkWidget(widget, own(answers, name) ? answers[name] : undefined);
        var marks = Number.isInteger(widget.marks) && widget.marks > 0 ? widget.marks : 0;
        result.fields[name] = correct;
        result.max += marks;
        if (correct) result.score += marks;
      });
    });
    return result;
  }

  function rehearsalPool(data) {
    if (!record(data) || !Array.isArray(data.questions) || !Array.isArray(data.topics) ||
        !data.questions.length || !data.topics.length || data.topics.length > 30) {
      throw new Error("The practice bank is not ready for a timed rehearsal.");
    }
    var topics = new Map();
    data.topics.forEach(function (topic, index) {
      if (!safeName(topic.id) || topics.has(topic.id)) throw new Error("The practice bank has invalid topic identifiers.");
      topics.set(topic.id, 1 << index);
    });
    var kindBits = { mcq: 1, structured: 2, applied: 4 };
    var ids = new Set();
    var allKinds = 0;
    var allTopics = (1 << topics.size) - 1;
    var availableTopics = 0;
    var items = data.questions.map(function (question) {
      if (!safeName(question.id) || ids.has(question.id) || !Number.isInteger(question.marks) ||
          question.marks <= 0 || question.marks > REHEARSAL_MARKS ||
          !own(kindBits, question.kind) || !Array.isArray(question.topics) || !question.topics.length) {
        throw new Error("The practice bank contains an invalid question.");
      }
      ids.add(question.id);
      var mask = 0;
      question.topics.forEach(function (id) {
        if (!topics.has(id)) throw new Error("A question refers to an unknown topic.");
        mask |= topics.get(id);
      });
      var kind = kindBits[question.kind];
      allKinds |= kind;
      availableTopics |= mask;
      return { id: question.id, marks: question.marks, topics: mask, kind: kind, question: question };
    });
    if (availableTopics !== allTopics || (allKinds & (allKinds - 1)) === 0) {
      throw new Error("A timed rehearsal needs complete topic coverage and varied question types.");
    }
    return { items: items, ids: ids, allTopics: allTopics, allKinds: allKinds };
  }

  function selectedQuestions(questionIds, data, preparedPool) {
    if (!Array.isArray(questionIds) || !questionIds.length ||
        new Set(questionIds).size !== questionIds.length) return null;
    var pool = preparedPool || rehearsalPool(data);
    var byId = new Map(pool.items.map(function (item) { return [item.id, item]; }));
    var selected = [];
    var marks = 0;
    var topics = 0;
    var kinds = 0;
    for (var i = 0; i < questionIds.length; i += 1) {
      var item = byId.get(questionIds[i]);
      if (!item) return null;
      selected.push(item.question);
      marks += item.marks;
      topics |= item.topics;
      kinds |= item.kind;
    }
    return marks === REHEARSAL_MARKS && topics === pool.allTopics && kinds === pool.allKinds ? selected : null;
  }

  function createRehearsal(data, previousQuestionIds, rng) {
    var pool = rehearsalPool(data);
    var items = pool.items;
    var count = items.length;
    var target = REHEARSAL_MARKS;
    var previous = new Set(Array.isArray(previousQuestionIds) ? previousQuestionIds : []);
    rng = rng === undefined ? Math.random : rng;
    if (typeof rng !== "function") throw new Error("The random source must be a function.");
    function random() {
      var value = rng();
      if (!finite(value) || value < 0 || value >= 1) throw new Error("The random source must return a value from 0 up to, but not including, 1.");
      return value;
    }
    function shuffle(selection) {
      var result = selection.map(function (index) { return items[index].id; });
      for (var i = result.length - 1; i > 0; i -= 1) {
        var j = Math.floor(random() * (i + 1));
        var held = result[i];
        result[i] = result[j];
        result[j] = held;
      }
      return { questionIds: result };
    }
    function covers(selection) {
      var topics = 0;
      var kinds = 0;
      selection.forEach(function (index) { topics |= items[index].topics; kinds |= items[index].kind; });
      return topics === pool.allTopics && kinds === pool.allKinds;
    }
    function repeats(selection) {
      return selection.length === previous.size && selection.every(function (index) { return previous.has(items[index].id); });
    }

    // Suffix knapsack counts allow whole-question, exact-mark sampling.
    var ways = Array.from({ length: count + 1 }, function () { return new Float64Array(target + 1); });
    ways[count][0] = 1;
    for (var i = count - 1; i >= 0; i -= 1) {
      for (var total = 0; total <= target; total += 1) {
        ways[i][total] = ways[i + 1][total] +
          (total >= items[i].marks ? ways[i + 1][total - items[i].marks] : 0);
      }
    }
    if (!ways[0][target]) throw new Error("This bank cannot make a whole-question 50-mark rehearsal.");
    var repeatedCandidate = null;
    for (var trial = 0; trial < 64; trial += 1) {
      var remaining = target;
      var candidate = [];
      for (var index = 0; index < count && remaining > 0; index += 1) {
        var include = remaining >= items[index].marks ? ways[index + 1][remaining - items[index].marks] : 0;
        var exclude = ways[index + 1][remaining];
        if (include && (!exclude || random() < include / (include + exclude))) {
          candidate.push(index);
          remaining -= items[index].marks;
        }
      }
      if (!remaining && covers(candidate)) {
        if (!repeats(candidate)) return shuffle(candidate);
        repeatedCandidate = candidate;
      }
    }

    // A constrained fallback proves whether an alternative membership exists;
    // even a constant RNG cannot force consecutive identical forms.
    var suffixTopics = new Int32Array(count + 1);
    var suffixKinds = new Int32Array(count + 1);
    var suffixPrevious = new Int32Array(count + 1);
    for (var s = count - 1; s >= 0; s -= 1) {
      suffixTopics[s] = suffixTopics[s + 1] | items[s].topics;
      suffixKinds[s] = suffixKinds[s + 1] | items[s].kind;
      suffixPrevious[s] = suffixPrevious[s + 1] + (previous.has(items[s].id) ? 1 : 0);
    }
    function findSelection(requireDifference) {
      var failed = new Set();
      var chosen = [];
      var initiallyDifferent = Array.from(previous).some(function (id) { return !pool.ids.has(id); });
      function visit(index, remaining, topics, kinds, different) {
        if (remaining === 0) {
          if (topics !== pool.allTopics || kinds !== pool.allKinds) return null;
          if (requireDifference && !different && suffixPrevious[index] === 0) return null;
          return chosen.slice();
        }
        if (index === count || !ways[index][remaining] ||
            (topics | suffixTopics[index]) !== pool.allTopics ||
            (kinds | suffixKinds[index]) !== pool.allKinds) return null;
        var memo = index + "," + remaining + "," + topics + "," + kinds + "," + (different ? 1 : 0);
        if (failed.has(memo)) return null;
        var item = items[index];
        function take() {
          if (remaining < item.marks) return null;
          chosen.push(index);
          var result = visit(index + 1, remaining - item.marks, topics | item.topics,
            kinds | item.kind, different || !previous.has(item.id));
          chosen.pop();
          return result;
        }
        function skip() {
          return visit(index + 1, remaining, topics, kinds, different || previous.has(item.id));
        }
        var result = random() < 0.5 ? take() || skip() : skip() || take();
        if (!result) failed.add(memo);
        return result;
      }
      return visit(0, target, 0, 0, initiallyDifferent);
    }
    var alternative = findSelection(previous.size > 0);
    if (alternative) return shuffle(alternative);
    var onlySelection = repeatedCandidate || findSelection(false);
    if (onlySelection) return shuffle(onlySelection);
    throw new Error("No 50-mark selection covers all topics and question types.");
  }

  function freshState(grade) {
    if ([7, 8, 9].indexOf(grade) === -1) throw new Error("Choose a supported grade (7, 8 or 9).");
    return { version: VERSION, grade: grade, questions: {}, lastQuestion: null,
      lastView: "home", exam: null, examHistory: [], updatedAt: Date.now() };
  }

  function newQState() {
    return { answers: {}, attempts: 0, best: 0, lastScore: 0, mastered: false,
      assisted: false, needsRecall: false, stepOpen: {}, hints: {}, everSeen: false };
  }

  function ensureQState(state, qid) {
    if (!record(state) || !safeName(qid)) throw new Error("Invalid question state.");
    if (!record(state.questions)) state.questions = {};
    if (!own(state.questions, qid) || !record(state.questions[qid])) state.questions[qid] = newQState();
    return state.questions[qid];
  }

  function mastery(question, progress) {
    return record(progress) && progress.mastered === true && progress.assisted !== true &&
      progress.needsRecall !== true &&
      finite(progress.attempts) && progress.attempts > 0 &&
      scoreQuestion(question, progress.answers).score === question.marks;
  }

  function assessment(state, data) {
    var result = { totalQuestions: data.questions.length, masteredCount: 0, attemptedCount: 0,
      masteredPoints: 0, bestPoints: 0, totalPoints: 0, reviewCount: 0,
      firstTryCount: 0 };
    var progress = record(state) && record(state.questions) ? state.questions : {};
    var selected = record(state) && record(state.exam) && state.exam.status === "finished" &&
      Array.isArray(state.exam.questionIds) ? new Set(state.exam.questionIds) : new Set();
    data.questions.forEach(function (question) {
      var q = own(progress, question.id) && record(progress[question.id]) ? progress[question.id] : newQState();
      var attempted = finite(q.attempts) && q.attempts > 0;
      var mastered = mastery(question, q);
      result.totalPoints += question.marks;
      result.bestPoints += attempted ? integer(q.best, 0, question.marks, 0) : 0;
      if (attempted) result.attemptedCount += 1;
      if (mastered) {
        result.masteredCount += 1;
        result.masteredPoints += question.marks;
        if (q.attempts === 1) result.firstTryCount += 1;
      } else {
        var missedExam = selected.has(question.id) &&
          scoreQuestion(question, record(state.exam.answers) ? state.exam.answers[question.id] : undefined).score < question.marks;
        if (attempted || q.assisted === true || q.needsRecall === true || missedExam) result.reviewCount += 1;
      }
    });
    return result;
  }

  function sanitizeAnswers(raw, question) {
    var answers = {};
    if (!record(raw)) return answers;
    question.parts.forEach(function (part) {
      part.widgets.forEach(function (widget) {
        var name = key(part, widget);
        if (!own(raw, name)) return;
        var value = raw[name];
        if (widget.type === "choice") {
          var index = choiceIndex(value, widget.options.length);
          if (index !== null) answers[name] = index;
        } else if (widget.type === "order") {
          if (validOrder(value, widget.items.length)) answers[name] = value.slice();
        } else if (widget.type === "text") {
          if (typeof value === "string" && value.length <= MAX_TEXT) answers[name] = value;
          else if (widget.normalize === "number" && finite(value)) answers[name] = String(value);
        }
      });
    });
    return answers;
  }

  function sanitizeQState(raw, question) {
    var clean = newQState();
    if (!record(raw)) return clean;
    clean.answers = sanitizeAnswers(raw.answers, question);
    clean.attempts = integer(raw.attempts, 0, 1000000, 0);
    clean.best = clean.attempts ? integer(raw.best, 0, question.marks, 0) : 0;
    clean.lastScore = clean.attempts ? integer(raw.lastScore, 0, question.marks, 0) : 0;
    clean.assisted = raw.assisted === true;
    clean.needsRecall = raw.needsRecall === true;
    question.parts.forEach(function (part) {
      if (record(raw.hints) && own(raw.hints, part.id)) clean.hints[part.id] = raw.hints[part.id] === true;
      if (record(raw.stepOpen) && own(raw.stepOpen, part.id)) {
        var open = raw.stepOpen[part.id];
        if (typeof open === "boolean") {
          clean.stepOpen[part.id] = open;
          if (open) clean.assisted = true;
        } else if (finite(open)) {
          clean.stepOpen[part.id] = integer(open, 0, part.steps.length, 0);
          if (clean.stepOpen[part.id] > 0) clean.assisted = true;
        } else if (record(open)) {
          clean.stepOpen[part.id] = {
            shown: integer(open.shown, 0, part.steps.length, 0),
            model: open.model === true
          };
          if (clean.stepOpen[part.id].shown || clean.stepOpen[part.id].model) clean.assisted = true;
        }
      }
      if (record(raw.modelOpen) && own(raw.modelOpen, part.id)) {
        if (!clean.modelOpen) clean.modelOpen = {};
        clean.modelOpen[part.id] = raw.modelOpen[part.id] === true;
        if (clean.modelOpen[part.id]) clean.assisted = true;
      }
    });
    clean.everSeen = raw.everSeen === true || clean.attempts > 0 || clean.assisted ||
      Object.keys(clean.answers).length > 0;
    var current = scoreQuestion(question, clean.answers);
    clean.mastered = raw.mastered === true && !clean.assisted && !clean.needsRecall && clean.attempts > 0 &&
      current.score === current.max;
    if (own(raw, "checked") || own(raw, "lastResult")) {
      clean.checked = raw.checked === true && clean.attempts > 0;
      clean.lastResult = clean.checked ? current : null;
      if (clean.checked) clean.lastScore = current.score;
    }
    if (clean.mastered) clean.lastScore = current.max;
    clean.best = Math.max(clean.best, clean.lastScore);
    return clean;
  }

  function sanitizeExam(raw, data) {
    if (!record(raw) || ["active", "finished"].indexOf(raw.status) === -1 ||
        !Array.isArray(raw.questionIds)) return null;
    var pool = rehearsalPool(data);
    var questionIds = raw.questionIds.map(function (id) { return savedId(id, data.grade, pool.ids); });
    if (questionIds.some(function (id) { return id === null; })) return null;
    var examQuestions = selectedQuestions(questionIds, data, pool);
    if (!examQuestions) return null;
    var ids = new Set(questionIds);
    var startedAt = timestamp(raw.startedAt, null);
    if (startedAt === null) return null;
    var deadline = timestamp(raw.deadline, startedAt + EXAM_MS);
    if (deadline < startedAt || deadline > startedAt + EXAM_MS) deadline = startedAt + EXAM_MS;
    var currentId = savedId(raw.currentQuestionId, data.grade, pool.ids);
    var clean = { status: raw.status, questionIds: questionIds.slice(),
      startedAt: startedAt, deadline: deadline, finishedAt: null,
      currentQuestionId: ids.has(currentId) ? currentId : questionIds[0],
      answers: {}, results: {}, score: 0, max: REHEARSAL_MARKS };
    var answerSources = new Map();
    if (record(raw.answers)) {
      Object.keys(raw.answers).forEach(function (id) {
        var mapped = savedId(id, data.grade, pool.ids);
        if (mapped && ids.has(mapped) && !answerSources.has(mapped)) answerSources.set(mapped, raw.answers[id]);
      });
      questionIds.forEach(function (id) {
        if (own(raw.answers, id)) answerSources.set(id, raw.answers[id]);
      });
    }
    examQuestions.forEach(function (q) {
      if (answerSources.has(q.id)) clean.answers[q.id] = sanitizeAnswers(answerSources.get(q.id), q);
    });
    if (raw.status === "finished") {
      var requestedFinish = Math.max(startedAt, timestamp(raw.finishedAt, Date.now()));
      clean.timedOut = raw.timedOut === true || requestedFinish >= deadline;
      clean.finishedAt = clean.timedOut ? Math.min(requestedFinish, deadline) : requestedFinish;
      examQuestions.forEach(function (q) {
        var result = scoreQuestion(q, clean.answers[q.id]);
        clean.results[q.id] = result;
        clean.score += result.score;
      });
      clean.elapsedSeconds = Math.max(0, Math.min(EXAM_MS / 1000,
        Math.floor((clean.finishedAt - clean.startedAt) / 1000)));
    }
    return clean;
  }

  function sanitizeHistory(raw, data) {
    if (!Array.isArray(raw)) return [];
    var maximum = REHEARSAL_MARKS;
    var pool = rehearsalPool(data);
    return raw.filter(function (entry) {
      return record(entry) && timestamp(entry.startedAt, null) !== null &&
        timestamp(entry.finishedAt, null) !== null && entry.finishedAt >= entry.startedAt &&
        finite(entry.score) && entry.score >= 0 && entry.score <= maximum;
    }).slice(-20).map(function (entry) {
      var clean = {
        startedAt: entry.startedAt, finishedAt: entry.finishedAt,
        score: Math.floor(entry.score), max: maximum,
        elapsedSeconds: integer(entry.elapsedSeconds, 0, EXAM_MS / 1000,
          Math.min(EXAM_MS / 1000, Math.floor((entry.finishedAt - entry.startedAt) / 1000))),
        timedOut: entry.timedOut === true
      };
      if (Array.isArray(entry.questionIds)) {
        var ids = entry.questionIds.map(function (id) { return savedId(id, data.grade, pool.ids); });
        if (selectedQuestions(ids, data, pool)) clean.questionIds = ids;
      }
      return clean;
    });
  }

  function validateImport(raw, data) {
    if (!record(data) || !Array.isArray(data.questions)) throw new Error("The question bank is unavailable.");
    if (typeof raw === "string") {
      if (raw.length > 2000000) throw new Error("This progress file is too large.");
      try { raw = JSON.parse(raw); }
      catch (error) { throw new Error("This file is not valid JSON progress data."); }
    }
    if (!record(raw)) throw new Error("This file does not contain a progress object.");
    if (own(raw, "schema") || own(raw, "state")) {
      if (raw.schema !== SCHEMA || raw.version !== VERSION || raw.grade !== data.grade || !record(raw.state)) {
        throw new Error("This progress file belongs to another grade or an unsupported format.");
      }
      raw = raw.state;
    }
    if (raw.version !== VERSION || raw.grade !== data.grade || !record(raw.questions)) {
      throw new Error("This progress state has the wrong grade, version or question structure.");
    }
    var clean = freshState(data.grade);
    var ids = new Set(data.questions.map(function (q) { return q.id; }));
    var savedQuestions = new Map();
    Object.keys(raw.questions).forEach(function (id) {
      var mapped = savedId(id, data.grade, ids);
      if (mapped && !savedQuestions.has(mapped)) savedQuestions.set(mapped, raw.questions[id]);
    });
    data.questions.forEach(function (question) {
      if (own(raw.questions, question.id)) savedQuestions.set(question.id, raw.questions[question.id]);
      if (savedQuestions.has(question.id)) {
        clean.questions[question.id] = sanitizeQState(savedQuestions.get(question.id), question);
      }
    });
    clean.lastQuestion = savedId(raw.lastQuestion, data.grade, ids);
    var previousView = raw.lastView === "exam" ? "timed" :
      raw.lastView === "exam-review" ? "challenge-review" : raw.lastView;
    var views = ["home", "practice", "learn", "progress", "timed", "results", "challenge-review"];
    clean.lastView = views.indexOf(previousView) !== -1 ? previousView : "home";
    clean.updatedAt = timestamp(raw.updatedAt, Date.now());
    if (record(raw.filters)) {
      var banks = ["all", "mcq", "written", "review"];
      var topics = new Set(data.topics.map(function (topic) { return topic.id; }));
      clean.filters = {
        bank: banks.indexOf(raw.filters.bank) !== -1 ? raw.filters.bank : "all",
        topic: topics.has(raw.filters.topic) ? raw.filters.topic : "all"
      };
    }
    clean.exam = sanitizeExam(raw.exam, data);
    if (clean.exam && clean.exam.status === "finished") {
      clean.exam.questionIds.forEach(function (id) {
        var result = clean.exam.results[id];
        if (result.score < result.max) {
          var progress = ensureQState(clean, id);
          // A later successful recall check resolves an earlier timed miss.
          if (progress.mastered) return;
          progress.needsRecall = true;
          progress.mastered = false;
        }
      });
    }
    if (!clean.exam && ["timed", "results", "challenge-review"].indexOf(clean.lastView) !== -1) {
      clean.lastView = "progress";
    }
    clean.examHistory = sanitizeHistory(raw.examHistory, data);
    return clean;
  }

  function exportState(state) {
    if (!record(state) || state.version !== VERSION || [7, 8, 9].indexOf(state.grade) === -1 ||
        !record(state.questions)) throw new Error("There is no valid progress to export.");
    var copy;
    try { copy = JSON.parse(JSON.stringify(state)); }
    catch (error) { throw new Error("Progress could not be exported."); }
    return { schema: SCHEMA, version: VERSION, grade: state.grade, state: copy };
  }

  return Object.freeze({
    normalize: normalize,
    checkWidget: checkWidget,
    key: key,
    scoreQuestion: scoreQuestion,
    createRehearsal: createRehearsal,
    freshState: freshState,
    ensureQState: ensureQState,
    assessment: assessment,
    validateImport: validateImport,
    exportState: exportState
  });
});
