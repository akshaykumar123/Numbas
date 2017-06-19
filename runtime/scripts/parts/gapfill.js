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

/** @file The {@link Numbas.parts.GapFillPart} object */

Numbas.queueScript('parts/gapfill',['base','display','jme','jme-variables','xml','util','scorm-storage','part'],function() {

var util = Numbas.util;
var jme = Numbas.jme;
var math = Numbas.math;
var tryGetAttribute = Numbas.xml.tryGetAttribute;

var Part = Numbas.parts.Part;

/** Gap-fill part: text with multiple input areas, each of which is its own sub-part, known as a 'gap'.
 * @constructor
 * @memberof Numbas.parts
 * @augments Numbas.parts.Part
 */
var GapFillPart = Numbas.parts.GapFillPart = function(xml, path, question, parentPart, loading)
{
	var gapXML = this.xml.selectNodes('gaps/part');

	this.marks = 0;

	for( var i=0 ; i<gapXML.length; i++ )
	{
		var gap = Numbas.createPart(gapXML[i], path+'g'+i, this.question, this, loading);
		gap.isGap = true;
		this.marks += gap.marks;
		this.gaps[i]=gap;
		this.answered = this.answered || gap.answered;
	}

	this.display = new Numbas.display.GapFillPartDisplay(this);
}	
GapFillPart.prototype = /** @lends Numbas.parts.GapFillPart.prototype */
{
	/** Included so the "no answer entered" error isn't triggered for the whole gap-fill part.
	 */
	stagedAnswer: 'something',

    /** The script to mark this part - assign credit, and give messages and feedback.
     * @type {Numbas.marking.MarkingScript}
     */
    markingScript: Numbas.marking_scripts.gapfill,

	/** Reveal the answers to all of the child gaps 
	 * Extends {@link Numbas.parts.Part.revealAnswer}
	 */
	revealAnswer: function(dontStore)
	{
		for(var i=0; i<this.gaps.length; i++)
			this.gaps[i].revealAnswer(dontStore);
	},

	/** Get the student's answer as it was entered as a JME data type, to be used in the custom marking algorithm
	 * @abstract
	 * @returns {Numbas.jme.token}
	 */
	rawStudentAnswerAsJME: function() {
		return new Numbas.jme.types.TList(this.gaps.map(function(g){return g.rawStudentAnswerAsJME()}));
	},

    setStudentAnswer: function() {
        this.studentAnswer = this.gaps.map(function(g) {
            if(g.stagedAnswer) {
                g.answerList = util.copyarray(g.stagedAnswer);
            }
            g.setStudentAnswer();
            return g.studentAnswer;
        });
    },

	/** Get the student's answer as a JME data type, to be used in error-carried-forward calculations
	 * @abstract
	 * @returns {Numbas.jme.token}
	 */
	studentAnswerAsJME: function() {
		return new Numbas.jme.types.TList(this.gaps.map(function(g){return g.studentAnswerAsJME()}));
	},

	/** Mark this part - add up the scores from each of the child gaps.
	 */
	mark_old: function()
	{
		this.credit=0;
		if(this.marks>0)
		{
			for(var i=0; i<this.gaps.length; i++)
			{
				var gap = this.gaps[i];
    			gap.submit();
				this.credit += gap.credit*gap.marks;
				if(this.gaps.length>1)
					this.markingComment(R('part.gapfill.feedback header',{index:i+1}));
				for(var j=0;j<gap.markingFeedback.length;j++)
				{
					var action = util.copyobj(gap.markingFeedback[j]);
					action.gap = i;
					this.markingFeedback.push(action);
				}
			}
			this.credit/=this.marks;
		}

		//go through all gaps, and if any one fails to validate then
		//whole part fails to validate
		var success = true;
		for(var i=0; i<this.gaps.length; i++) {
			success = success && this.gaps[i].answered;
        }

        this.answered = success;
	}

};
GapFillPart.prototype.revealAnswer = util.extend(GapFillPart.prototype.revealAnswer, Part.prototype.revealAnswer);

Numbas.partConstructors['gapfill'] = util.extend(Part,GapFillPart);
});