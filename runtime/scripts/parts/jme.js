/*
Copyright 2011-15 Newcastle University

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

/** @file The {@link Numbas.parts.JMEPart} object */

Numbas.queueScript('parts/jme',['base','display','jme','jme-variables','xml','util','scorm-storage','part','marking_scripts'],function() {

var util = Numbas.util;
var jme = Numbas.jme;
var math = Numbas.math;
var tryGetAttribute = Numbas.xml.tryGetAttribute;
var nicePartName = util.nicePartName;

var Part = Numbas.parts.Part;

/** Judged Mathematical Expression
 *
 * Student enters a string representing a mathematical expression, eg. `x^2+x+1`, and it is compared with the correct answer by evaluating over a range of values.
 * @constructor
 * @memberof Numbas.parts
 * @augments Numbas.parts.Part
 */
var JMEPart = Numbas.parts.JMEPart = function(xml, path, question, parentPart, loading)
{
	var settings = this.settings;
	util.copyinto(JMEPart.prototype.settings,settings);

	//parse correct answer from XML
	answerMathML = this.xml.selectSingleNode('answer/correctanswer');
	if(!answerMathML) {
		this.error('part.jme.answer missing');
	}

	tryGetAttribute(settings,this.xml,'answer/correctanswer','simplification','answerSimplificationString');

	settings.correctAnswerString = Numbas.xml.getTextContent(answerMathML).trim();

	this.getCorrectAnswer(this.question.scope);

	//get checking type, accuracy, checking range
	var parametersPath = 'answer';
	tryGetAttribute(settings,this.xml,parametersPath+'/checking',['type','accuracy','failurerate'],['checkingType','checkingAccuracy','failureRate']);

	tryGetAttribute(settings,this.xml,parametersPath+'/checking/range',['start','end','points'],['vsetRangeStart','vsetRangeEnd','vsetRangePoints']);


	//max length and min length
	tryGetAttribute(settings,this.xml,parametersPath+'/maxlength',['length','partialcredit'],['maxLength','maxLengthPC']);
	var messageNode = xml.selectSingleNode('answer/maxlength/message');
	if(messageNode)
	{
		settings.maxLengthMessage = $.xsl.transform(Numbas.xml.templates.question,messageNode).string;
		if($(settings.maxLengthMessage).text() == '')
			settings.maxLengthMessage = R('part.jme.answer too long');
	}
	tryGetAttribute(settings,this.xml,parametersPath+'/minlength',['length','partialcredit'],['minLength','minLengthPC']);
	var messageNode = xml.selectSingleNode('answer/minlength/message');
	if(messageNode)
	{
		settings.minLengthMessage = $.xsl.transform(Numbas.xml.templates.question,messageNode).string;
		if($(settings.minLengthMessage).text() == '')
			settings.minLengthMessage = R('part.jme.answer too short');
	}

	//get list of 'must have' strings
	var mustHaveNode = this.xml.selectSingleNode('answer/musthave');
	settings.mustHave = [];
	if(mustHaveNode)
	{
		var mustHaves = mustHaveNode.selectNodes('string');
		for(var i=0; i<mustHaves.length; i++)
		{
			settings.mustHave.push(Numbas.xml.getTextContent(mustHaves[i]));
		}
		//partial credit for failing must-have test and whether to show strings which must be present to student when warning message displayed
		tryGetAttribute(settings,this.xml,mustHaveNode,['partialcredit','showstrings'],['mustHavePC','mustHaveShowStrings']);
		//warning message to display when a must-have is missing
		var messageNode = mustHaveNode.selectSingleNode('message');
		if(messageNode)
			settings.mustHaveMessage = $.xsl.transform(Numbas.xml.templates.question,messageNode).string;
	}

	//get list of 'not allowed' strings
	var notAllowedNode = this.xml.selectSingleNode('answer/notallowed');
	settings.notAllowed = [];
	if(notAllowedNode)
	{
		var notAlloweds = notAllowedNode.selectNodes('string');
		for(i=0; i<notAlloweds.length; i++)
		{
			settings.notAllowed.push(Numbas.xml.getTextContent(notAlloweds[i]));
		}
		//partial credit for failing not-allowed test
		tryGetAttribute(settings,this.xml,notAllowedNode,['partialcredit','showstrings'],['notAllowedPC','notAllowedShowStrings']);
		var messageNode = notAllowedNode.selectSingleNode('message');
		if(messageNode)
			settings.notAllowedMessage = $.xsl.transform(Numbas.xml.templates.question,messageNode).string;
	}

	tryGetAttribute(settings,this.xml,parametersPath,['checkVariableNames','showPreview']);
	var expectedVariableNamesNode = this.xml.selectSingleNode('answer/expectedvariablenames');
	settings.expectedVariableNames = [];
	if(expectedVariableNamesNode)
	{
		var nameNodes = expectedVariableNamesNode.selectNodes('string');
		for(i=0; i<nameNodes.length; i++)
			settings.expectedVariableNames.push(Numbas.xml.getTextContent(nameNodes[i]).toLowerCase().trim());
	}

	this.display = new Numbas.display.JMEPartDisplay(this);

	if(loading)	{
		var pobj = Numbas.store.loadJMEPart(this);
		this.stagedAnswer = [pobj.studentAnswer];
	}
	else {
		this.stagedAnswer = [''];
	}
}

JMEPart.prototype = /** @lends Numbas.JMEPart.prototype */ 
{
	/** Student's last submitted answer
	 * @type {String}
	 */
	studentAnswer: '',

    /** The script to mark this part - assign credit, and give messages and feedback.
     * @type {Numbas.marking.MarkingScript}
     */
    markingScript: Numbas.marking_scripts.jme,

	/** Properties set when the part is generated.
	 *
	 * Extends {@link Numbas.parts.Part#settings}
	 * @property {JME} correctAnswerString - the definition of the correct answer, without variables substituted into it.
	 * @property {String} correctAnswer - An expression representing the correct answer to the question. The student's answer should evaluate to the same value as this.
	 * @property {String} answerSimplificationString - string from the XML defining which answer simplification rules to use
	 * @property {Array.<String>} answerSimplification - names of simplification rules (see {@link Numbas.jme.display.Rule}) to use on the correct answer
	 * @property {String} checkingType - method to compare answers. See {@link Numbas.jme.checkingFunctions}
	 * @property {Number} checkingAccuracy - accuracy threshold for checking. Exact definition depends on the checking type.
	 * @property {Number} failureRate - comparison failures allowed before we decide answers are different
	 * @property {Number} vsetRangeStart - lower bound on range of points to pick values from for variables in the answer expression
	 * @property {Number} vsetRangeEnd - upper bound on range of points to pick values from for variables in the answer expression
	 * @property {Number} vsetRangePoints - number of points to compare answers on
	 * @property {Number} maxLength - maximum length, in characters, of the student's answer. Note that the student's answer is cleaned up before checking length, so extra space or brackets aren't counted
	 * @property {Number} maxLengthPC - partial credit if the student's answer is too long
	 * @property {String} maxLengthMessage - Message to add to marking feedback if the student's answer is too long
	 * @property {Number} minLength - minimum length, in characters, of the student's answer. Note that the student's answer is cleaned up before checking length, so extra space or brackets aren't counted
	 * @property {Number} minLengthPC - partial credit if the student's answer is too short
	 * @property {String} minLengthMessage - message to add to the marking feedback if the student's answer is too short
	 * @property {Array.<String>} mustHave - strings which must be present in the student's answer
	 * @property {Number} mustHavePC - partial credit to award if any must-have string is missing
	 * @property {String} mustHaveMessage - message to add to the marking feedback if the student's answer is missing a must-have string.
	 * @property {Boolean} mustHaveShowStrings - tell the students which strings must be included in the marking feedback, if they're missing a must-have?
	 * @property {Array.<String>} notAllowed - strings which must not be present in the student's answer
	 * @property {Number} notAllowedPC - partial credit to award if any not-allowed string is present
	 * @property {String} notAllowedMessage - message to add to the marking feedback if the student's answer contains a not-allowed string.
	 * @property {Boolean} notAllowedShowStrings - tell the students which strings must not be included in the marking feedback, if they've used a not-allowed string?
	 */
	settings: 
	{
		correctAnswerString: '',
		correctAnswer: '',

		answerSimplificationString: '',
		answerSimplification: ['basic','unitFactor','unitPower','unitDenominator','zeroFactor','zeroTerm','zeroPower','collectNumbers','zeroBase','constantsFirst','sqrtProduct','sqrtDivision','sqrtSquare','otherNumbers'],
		
		checkingType: 'RelDiff',

		checkingAccuracy: 0,
		failureRate: 0,

		vsetRangeStart: 0,
		vsetRangeEnd: 1,
		vsetRangePoints: 1,
		
		maxLength: 0,
		maxLengthPC: 0,
		maxLengthMessage: 'Your answer is too long',

		minLength: 0,
		minLengthPC: 0,
		minLengthMessage: 'Your answer is too short',

		mustHave: [],
		mustHavePC: 0,
		mustHaveMessage: '',
		mustHaveShowStrings: false,

		notAllowed: [],
		notAllowedPC: 0,
		notAllowedMessage: '',
		notAllowedShowStrings: false
	},

	/** Compute the correct answer, based on the given scope
	 */
	getCorrectAnswer: function(scope) {
		var settings = this.settings;

		settings.answerSimplification = Numbas.jme.collectRuleset(settings.answerSimplificationString,scope.allRulesets());

		var expr = jme.subvars(settings.correctAnswerString,scope);
		settings.correctAnswer = jme.display.simplifyExpression(
			expr,
			settings.answerSimplification,
			scope
		);
		if(settings.correctAnswer == '' && this.marks>0) {
			this.error('part.jme.answer missing');
		}

		this.markingScope = new jme.Scope(this.question.scope);
		this.markingScope.variables = {};

	},

	/** Save a copy of the student's answer as entered on the page, for use in marking.
	 */
	setStudentAnswer: function() {
		this.studentAnswer = this.answerList[0];
	},

	/** Get the student's answer as it was entered as a JME data type, to be used in the custom marking algorithm
	 * @abstract
	 * @returns {Numbas.jme.token}
	 */
	rawStudentAnswerAsJME: function() {
		return new Numbas.jme.types.TString(this.studentAnswer);
	}
};

Numbas.partConstructors['jme'] = util.extend(Part,JMEPart);

});
